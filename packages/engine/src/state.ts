/**
 * The interview state. It is plain JSON so it can be saved on the phone, sent to the server and
 * stored in the database unchanged. Everything else (current phase, next question, notes) is
 * derived from it by pure functions, so the phone and the server always agree.
 */
import type { Lang } from "@setu/bank";

export type Sex = "male" | "female" | "other";

export interface Patient {
  ageYears?: number;
  sex?: Sex;
}

/** Where a question lives: a complaint id, or one of the history sections. */
export type Scope = string;
export const PAST_HISTORY = "past-history";
export const PERSONAL_HISTORY = "personal-history";

export interface Answer {
  /** Chosen option ids (single and multi questions). */
  optionIds?: string[];
  /** Entered value: days or count for duration/number, ISO date for date, words for text. */
  value?: number | string;
  /** Extra input for options with a detail, keyed by option id ("Others[describe]" -> what they said). */
  details?: Record<string, string>;
  /** The patient could not or would not answer. Recorded as such, never as "no". */
  skipped?: "dont_know" | "refused";
  /** How the answer was given. */
  source: "tap" | "voice" | "staff";
  /** For voice answers: what speech recognition heard, and how sure the answer mapping was. */
  transcript?: string;
  confidence?: "high" | "medium" | "low";
}

export interface FiredRedFlag {
  ruleId: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
}

export interface InterviewState {
  bankVersion: string;
  lang: Lang;
  patient: Patient;
  /** Complaints to ask about, in order. Chosen ones first; linked ones ("~Chest Pain") are added as they come up. */
  complaints: string[];
  /** Answers keyed by `${scope}/${questionId}`. */
  answers: Record<string, Answer>;
  redFlags: FiredRedFlag[];
  /** The patient confirmed the review screen. */
  confirmed: boolean;
}

export function answerKey(scope: Scope, questionId: string): string {
  return `${scope}/${questionId}`;
}
