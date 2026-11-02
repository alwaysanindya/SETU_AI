import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Bank } from "@setu/bank";
import { answerQuestion, nextStep, type Step } from "../src/flow";
import type { Answer, InterviewState } from "../src/state";

/** The real compiled bank. Run `pnpm bank:build` after changing content. */
export const bank: Bank = Bank.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("../../../content/bank/bank.json", import.meta.url)), "utf8")),
);

export const tap = (...optionIds: string[]): Answer => ({ optionIds, source: "tap" });
export const value = (v: number | string): Answer => ({ value: v, source: "tap" });

/** Answers whatever question comes next. Fails if the next step is not a question. */
export function answerNext(state: InterviewState, answer: Answer): InterviewState {
  const step = nextStep(bank, state);
  if (step.type !== "question") throw new Error(`Expected a question, got ${step.type}`);
  return answerQuestion(bank, state, step.scope, step.question.id, answer);
}

export function questionStep(step: Step): Extract<Step, { type: "question" }> {
  if (step.type !== "question") throw new Error(`Expected a question, got ${step.type}`);
  return step;
}
