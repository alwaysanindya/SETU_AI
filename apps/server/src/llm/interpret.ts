/**
 * Turns a spoken answer into a suggested Answer. Order:
 *   1. "I don't know" phrases
 *   2. numbers and durations ("teen din" -> 3 days)
 *   3. option labels and synonyms
 *   4. the local LLM, if the above found nothing
 * The suggestion is shown back to the patient ("Did you mean: Severe?") and only saved once confirmed.
 */
import type { Lang, Question } from "@setu/bank";
import { validateAnswer, type Answer } from "@setu/engine";
import type { LlmGateway } from "./gateway";
import { isDontKnow, matchOptions, parseDurationDays, parseNumber } from "./synonyms";

export interface Interpretation {
  /** The suggested answer, or undefined when nothing could be understood (ask again or use the buttons). */
  answer?: Answer;
  method: "dont_know" | "number" | "synonym" | "llm" | "none";
}

export async function interpretAnswer(
  question: Question,
  transcript: string,
  lang: Lang,
  llm: LlmGateway | undefined,
): Promise<Interpretation> {
  const base = { source: "voice" as const, transcript };

  if (isDontKnow(transcript, lang)) return { method: "dont_know", answer: { ...base, skipped: "dont_know", confidence: "high" } };

  if (question.kind === "duration" || question.kind === "number") {
    const n = question.kind === "duration" ? parseDurationDays(transcript) : parseNumber(transcript);
    if (n !== undefined) return { method: "number", answer: { ...base, value: n, confidence: "high" } };
  } else if (question.kind === "single" || question.kind === "multi") {
    const ids = matchOptions(question, transcript, lang);
    if (ids) return { method: "synonym", answer: { ...base, optionIds: ids, confidence: "high" } };
  } else if (question.kind === "text") {
    return { method: "synonym", answer: { ...base, value: transcript.trim(), confidence: "high" } };
  }

  if (!llm) return { method: "none" };
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
