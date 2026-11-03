/**
 * The chat history shown above the current question: what the app asked and what the patient
 * answered, in the patient's language, with a short spoken intro whenever a new topic starts.
 * Derived from the interview state, so it is always in step with what is saved.
 */
import { t, type Bank, type Lang, type Question } from "@setu/bank";
import { PAST_HISTORY, PERSONAL_HISTORY, type Answer, type InterviewState } from "@setu/engine";
import { ui } from "./i18n";

export type ChatItem =
  | { kind: "intro"; text: string }
  | { kind: "question"; text: string }
  | { kind: "answer"; text: string; scope: string; questionId: string; voice: boolean };

export function questionsOf(bank: Bank, scope: string): Question[] {
  if (scope === PAST_HISTORY) return bank.pastHistory.questions;
  if (scope === PERSONAL_HISTORY) return bank.personalHistory.questions;
  return bank.complaints.find((c) => c.id === scope)?.questions ?? [];
}

/** The spoken line that opens a topic: "Now a few questions about your chest pain." */
export function introFor(bank: Bank, scope: string, lang: Lang): string {
  if (scope === PAST_HISTORY) return ui("pastIntro", lang);
  if (scope === PERSONAL_HISTORY) return ui("personalIntro", lang);
  const c = bank.complaints.find((x) => x.id === scope);
  const name = c ? t(c.name, lang) : scope;
  return ui("aboutComplaint", lang).replace("{name}", lang === "en" ? name.toLowerCase() : name);
}

function formatDuration(days: number, lang: Lang): string {
  const units = [
    { id: "years", d: 365 },
    { id: "months", d: 30 },
    { id: "weeks", d: 7 },
  ] as const;
  for (const u of units) if (days >= u.d && days % u.d === 0) return `${days / u.d} ${ui(u.id, lang)}`;
  return `${days} ${ui("days", lang)}`;
}

/** How an answer reads back to the patient: "Severe", "2 weeks", "Others: back of the neck", "I don't know". */
export function describeAnswer(q: Question, a: Answer, lang: Lang): string {
  if (a.skipped) return ui("dontKnow", lang);
  if (a.optionIds) {
    return a.optionIds
      .map((id) => {
        const o = q.options.find((x) => x.id === id);
        const label = o ? t(o.label, lang) : id;
        const detail = a.details?.[id];
        return detail ? `${label}: ${detail}` : label;
      })
      .join(", ");
  }
  if (q.kind === "duration" && typeof a.value === "number") return formatDuration(a.value, lang);
  return String(a.value ?? "");
}

/** Scopes in the order they are asked. */
function scopes(state: InterviewState): string[] {
  return [...state.complaints, PAST_HISTORY, PERSONAL_HISTORY];
}

export function conversation(bank: Bank, state: InterviewState): ChatItem[] {
  const items: ChatItem[] = [];
  for (const scope of scopes(state)) {
    const answered = questionsOf(bank, scope).filter((q) => state.answers[`${scope}/${q.id}`]);
    if (answered.length === 0) continue;
    items.push({ kind: "intro", text: introFor(bank, scope, state.lang) });
    for (const q of answered) {
      const a = state.answers[`${scope}/${q.id}`]!;
      items.push({ kind: "question", text: t(q.text, state.lang) });
      items.push({ kind: "answer", text: describeAnswer(q, a, state.lang), scope, questionId: q.id, voice: a.source === "voice" });
    }
  }
  return items;
}

/** Whether this question is the first one asked in its topic (so the intro should be spoken). */
export function startsTopic(state: InterviewState, scope: string): boolean {
  return !Object.keys(state.answers).some((k) => k.startsWith(`${scope}/`));
}

/** Answered and roughly-remaining questions, for the progress bar. Linked complaints can add more. */
export function progress(bank: Bank, state: InterviewState): { answered: number; total: number } {
  let answered = 0;
  let total = 0;
  for (const scope of scopes(state)) {
    for (const q of questionsOf(bank, scope)) {
      const sex = q.appliesTo?.sex;
      if (sex && state.patient.sex && state.patient.sex !== sex) continue;
      total++;
      if (state.answers[`${scope}/${q.id}`]) answered++;
    }
  }
  return { answered, total };
}
