/**
 * Interview flow. Three kinds of function:
 *  - startInterview / chooseComplaints / answerQuestion / acknowledgeRedFlag / confirm:
 *    take a state and return a NEW state (never mutate)
 *  - nextStep: looks at a state and says what to show next
 *  - validateAnswer: checks an answer fits its question before it is stored
 *
 * Order of the interview:
 *   1. unacknowledged red flag?  -> red-flag screen (blocks everything until staff acknowledge)
 *   2. no complaint chosen yet?  -> choose complaint
 *   3. a complaint with unanswered questions? -> its next question (complaints in list order)
 *   4. past medical history, then personal history
 *   5. review screen, then done
 */
import type { Bank, Lang, Question, RedFlagRule, Section } from "@setu/bank";
import { getComplaint } from "@setu/bank";
import { matchingRules } from "./red-flags";
import {
  answerKey,
  PAST_HISTORY,
  PERSONAL_HISTORY,
  type Answer,
  type InterviewState,
  type Patient,
  type Scope,
} from "./state";

export type Step =
  | { type: "red_flag"; rules: RedFlagRule[] }
  | { type: "choose_complaint" }
  | { type: "question"; scope: Scope; question: Question; complaintId?: string }
  | { type: "review" }
  | { type: "done" };

export function startInterview(bank: Bank, lang: Lang, patient: Patient): InterviewState {
  return { bankVersion: bank.version, lang, patient, complaints: [], answers: {}, redFlags: [], confirmed: false };
}

/** Records the complaints the patient chose on the first screen, in the order chosen. */
export function chooseComplaints(bank: Bank, state: InterviewState, complaintIds: string[]): InterviewState {
  for (const id of complaintIds) getComplaint(bank, id); // throws on unknown ids
  const complaints = [...state.complaints];
  for (const id of complaintIds) if (!complaints.includes(id)) complaints.push(id);
  return { ...state, complaints };
}

/** Whether a question should be asked of this patient (sex-specific questions). */
export function applies(question: Question, state: InterviewState): boolean {
  const sex = question.appliesTo?.sex;
  return !sex || state.patient.sex === sex || state.patient.sex === undefined;
}

function firstUnanswered(questions: Question[], scope: Scope, state: InterviewState): Question | undefined {
  return questions.find((q) => applies(q, state) && !(answerKey(scope, q.id) in state.answers));
}

function section(bank: Bank, scope: typeof PAST_HISTORY | typeof PERSONAL_HISTORY): Section {
  return scope === PAST_HISTORY ? bank.pastHistory : bank.personalHistory;
}

export function nextStep(bank: Bank, state: InterviewState): Step {
  const pending = state.redFlags.filter((f) => !f.acknowledged).map((f) => f.ruleId);
  if (pending.length > 0) return { type: "red_flag", rules: bank.redFlags.filter((r) => pending.includes(r.id)) };

  if (state.complaints.length === 0) return { type: "choose_complaint" };

  for (const complaintId of state.complaints) {
    const q = firstUnanswered(getComplaint(bank, complaintId).questions, complaintId, state);
    if (q) return { type: "question", scope: complaintId, question: q, complaintId };
  }
  for (const scope of [PAST_HISTORY, PERSONAL_HISTORY] as const) {
    const q = firstUnanswered(section(bank, scope).questions, scope, state);
    if (q) return { type: "question", scope, question: q };
  }
  return state.confirmed ? { type: "done" } : { type: "review" };
}

/** Finds the question an answer is for. */
export function findQuestion(bank: Bank, scope: Scope, questionId: string): Question {
  const questions =
    scope === PAST_HISTORY || scope === PERSONAL_HISTORY ? section(bank, scope).questions : getComplaint(bank, scope).questions;
  const q = questions.find((x) => x.id === questionId);
  if (!q) throw new Error(`Unknown question "${questionId}" in "${scope}"`);
  return q;
}

/** Returns a list of problems; empty means the answer is valid for the question. */
export function validateAnswer(question: Question, answer: Answer): string[] {
  if (answer.skipped) return [];
  const problems: string[] = [];
  const ids = answer.optionIds ?? [];
  const known = new Set(question.options.map((o) => o.id));
  switch (question.kind) {
    case "single":
      if (ids.length !== 1) problems.push("Choose exactly one answer.");
      break;
    case "multi": {
      if (ids.length === 0) problems.push("Choose at least one answer.");
      const exclusive = question.options.filter((o) => o.exclusive && ids.includes(o.id));
      if (exclusive.length > 0 && ids.length > 1) problems.push(`"${exclusive[0]!.label.en}" cannot be combined with other answers.`);
      break;
    }
    case "duration":
    case "number":
      if (typeof answer.value !== "number" || !Number.isFinite(answer.value) || answer.value < 0) problems.push("Enter a number of 0 or more.");
      break;
    case "date":
      if (typeof answer.value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(answer.value)) problems.push("Enter a date as YYYY-MM-DD.");
      break;
    case "text":
      if (typeof answer.value !== "string" || answer.value.trim() === "") problems.push("Enter some text.");
      break;
  }
  for (const id of ids) if (!known.has(id)) problems.push(`Unknown answer "${id}".`);
  for (const id of Object.keys(answer.details ?? {})) {
    if (!ids.includes(id)) problems.push(`Detail given for "${id}", which was not chosen.`);
  }
  return problems;
}

export class InvalidAnswerError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
  }
}

/**
 * Stores an answer and applies its effects:
 *  - linked complaints ("~Chest Pain") are added; urgent ones go to the front so they are asked next
 *  - red-flag rules are re-checked; newly matching rules are added unacknowledged
 */
export function answerQuestion(bank: Bank, state: InterviewState, scope: Scope, questionId: string, answer: Answer): InterviewState {
  const question = findQuestion(bank, scope, questionId);
  const problems = validateAnswer(question, answer);
  if (problems.length > 0) throw new InvalidAnswerError(problems);

  let complaints = [...state.complaints];
  for (const id of answer.optionIds ?? []) {
    const target = question.options.find((o) => o.id === id)?.triggersComplaint;
    if (!target || complaints.includes(target)) continue;
    complaints = bank.urgentComplaints.includes(target) ? [target, ...complaints] : [...complaints, target];
  }

  const next: InterviewState = {
    ...state,
    complaints,
    answers: { ...state.answers, [answerKey(scope, questionId)]: answer },
    confirmed: false,
  };
  const already = new Set(state.redFlags.map((f) => f.ruleId));
  const fired = matchingRules(bank, next).filter((r) => !already.has(r.id));
  return fired.length === 0 ? next : { ...next, redFlags: [...next.redFlags, ...fired.map((r) => ({ ruleId: r.id, acknowledged: false }))] };
}

/** Staff have seen the red-flag screen. The interview may continue. */
export function acknowledgeRedFlag(state: InterviewState, ruleId: string, by: string): InterviewState {
  return {
    ...state,
    redFlags: state.redFlags.map((f) => (f.ruleId === ruleId ? { ...f, acknowledged: true, acknowledgedBy: by } : f)),
  };
}

/** The patient confirmed the review screen. */
export function confirm(bank: Bank, state: InterviewState): InterviewState {
  const step = nextStep(bank, state);
  if (step.type !== "review") throw new Error(`Cannot confirm while the interview is at "${step.type}"`);
  return { ...state, confirmed: true };
}
