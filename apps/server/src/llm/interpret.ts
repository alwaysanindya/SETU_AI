/**
 * Turns a spoken answer into a suggested Answer. Order:
 *   1. "I don't know" phrases
 *   2. numbers and durations ("teen din" -> 3 days)
 *   3. option labels and synonyms
 *   4. the local LLM, if the above found nothing
 * The suggestion is shown back to the patient ("Did you mean: Severe?") and only saved once confirmed.
 */
import type { Lang, Question } from "@setu/bank";
import { matchAnswer, validateAnswer, type Answer, type AnswerMatch } from "@setu/engine";
import type { LlmGateway } from "./gateway";

export interface Interpretation {
  /** The suggested answer, or undefined when nothing could be understood (ask again or use the buttons). */
  answer?: Answer;
  method: AnswerMatch["method"] | "llm";
}

export async function interpretAnswer(
  question: Question,
  transcript: string,
  lang: Lang,
  llm: LlmGateway | undefined,
): Promise<Interpretation> {
  const rules = matchAnswer(question, transcript, lang);
  if (rules.method !== "none" || !llm) return rules;

  const base = { source: "voice" as const, transcript };
  let choice;
  try {
    choice = await llm.interpret(question, transcript, lang);
  } catch {
    return { method: "none" }; // LLM down or slow: the patient can still tap the buttons
  }
  if (!choice) return { method: "none" };
  if (choice.dontKnow) return { method: "llm", answer: { ...base, skipped: "dont_know", confidence: choice.confidence } };
  const answer: Answer =
    question.options.length > 0
      ? { ...base, optionIds: choice.optionIds, confidence: choice.confidence }
      : { ...base, value: choice.value, confidence: choice.confidence };
  return validateAnswer(question, answer).length === 0 ? { method: "llm", answer } : { method: "none" };
}
