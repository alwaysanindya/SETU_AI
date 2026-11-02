/** Evaluates red-flag rules against the answers. No LLM is involved, by design. */
import type { Bank, Condition, RedFlagRule } from "@setu/bank";
import { answerKey, type InterviewState } from "./state";

export function conditionHolds(cond: Condition, state: InterviewState): boolean {
  if ("all" in cond) return cond.all.every((c) => conditionHolds(c, state));
  if ("any" in cond) return cond.any.some((c) => conditionHolds(c, state));
  if ("patient" in cond) {
    const { ageUnder, ageAtLeast, sex } = cond.patient;
    const age = state.patient.ageYears;
    if (ageUnder !== undefined && !(age !== undefined && age < ageUnder)) return false;
    if (ageAtLeast !== undefined && !(age !== undefined && age >= ageAtLeast)) return false;
    if (sex !== undefined && state.patient.sex !== sex) return false;
    return true;
  }
  if ("answer" in cond) {
    const a = state.answers[answerKey(cond.answer.complaint, cond.answer.question)];
    return !!a?.optionIds?.some((id) => cond.answer.optionIn.includes(id));
  }
  const a = state.answers[answerKey(cond.numberAtLeast.complaint, cond.numberAtLeast.question)];
  return typeof a?.value === "number" && a.value >= cond.numberAtLeast.value;
}

/** Rules that hold now. Includes unapproved draft rules: in a pilot it is safer to over-alert. */
export function matchingRules(bank: Bank, state: InterviewState): RedFlagRule[] {
  return bank.redFlags.filter((r) => conditionHolds(r.when, state));
}
