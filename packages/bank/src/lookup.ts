/** Small helpers for finding things in a bank. Kept here so every package looks things up the same way. */
import type { Bank, Complaint, Lang, LocalizedText, Question } from "./schema";

export function getComplaint(bank: Bank, complaintId: string): Complaint {
  const c = bank.complaints.find((x) => x.id === complaintId);
  if (!c) throw new Error(`Unknown complaint "${complaintId}"`);
  return c;
}

export function getQuestion(bank: Bank, complaintId: string, questionId: string): Question {
  const q = getComplaint(bank, complaintId).questions.find((x) => x.id === questionId);
  if (!q) throw new Error(`Unknown question "${questionId}" in complaint "${complaintId}"`);
  return q;
}

/** Text in the requested language, falling back to English when no reviewed translation exists yet. */
export function t(text: LocalizedText, lang: Lang): string {
  return text[lang] ?? text.en;
}
