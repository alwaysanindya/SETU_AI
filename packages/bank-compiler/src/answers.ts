/**
 * Parsing the "Possible answers" column of the complaints sheet.
 *
 * The sheet uses a small informal language, which this file turns into structure:
 *   "Mild;Moderate;Severe"         three options (";" is the intended separator)
 *   "Yes/No", "Yes: No", "a,b"     also options, but reported as a warning
 *   "_days"                        a duration in days
 *   "_freq", "[number]", "[]"      a number
 *   "[date]"                       a date
 *   "[describe]"                   free text
 *   "Others[describe]"             an option that also asks for free text
 *   "regular [# days]"             an option that also asks for a number
 * Separators inside [...] or (...) are ignored, so "Yes [Throbbing;Dull]" is one option.
 */
import type { AnswerKind, OptionDetail } from "@setu/bank";

export interface SplitResult {
  parts: string[];
  /** The separator actually used, when it was not ";" (reported as a warning). */
  unusualSeparator?: string;
  /** True when an empty part was dropped, e.g. a trailing ";". */
  droppedEmpty: boolean;
}

function splitAtDepthZero(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Whether a split on an unusual separator ("/", ":" or ",") looks like a real list of answers.
 * Guards against "H/O Injury", "Increase on coughing/straining" and "If yes, Write location []".
 */
function looksLikeList(parts: string[]): boolean {
  if (parts.some((p) => p.trim().length <= 1)) return false;
  if (parts.length >= 3) return parts.every((p) => words(p) <= 5);
  return parts.every((p) => words(p) <= 2);
}

/** Splits an answers cell into option tokens. Uses ";" and, failing that, "/", ":" or "," when the result looks like a list. */
export function splitAnswers(cell: string): SplitResult {
  for (const sep of [";", "/", ":", ","]) {
    const raw = splitAtDepthZero(cell, sep);
    if (raw.length > 1) {
      const trimmed = raw.map((p) => p.trim());
      const parts = trimmed.filter((p) => p !== "");
      if (sep !== ";" && !looksLikeList(parts)) continue;
      return {
        parts,
        unusualSeparator: sep === ";" ? undefined : sep,
        droppedEmpty: parts.length !== trimmed.length,
      };
    }
  }
  const single = cell.trim();
  return { parts: single ? [single] : [], droppedEmpty: false };
}

/** A token that is a value to enter rather than an option to pick. */
export interface ValueToken {
  kind: Exclude<AnswerKind, "single" | "multi">;
  prompt?: string;
}

/**
 * Recognises tokens like "_days", "[number]", "[date] *either calendar...", "[describe]",
 * "Decription Box", "[] days/months/years". Returns undefined for ordinary options.
 * `questionText` breaks ties for an empty "[]".
 */
export function parseValueToken(token: string, questionText: string): ValueToken | undefined {
  const t = token.trim();
  if (/^_days?$/i.test(t)) return { kind: "duration" };
  if (/^_freq$/i.test(t)) return { kind: "number", prompt: "times per day" };
  if (/^des?c?ription box$/i.test(t)) return { kind: "text" };
  const m = /^\[([^\]]*)\]\s*(.*)$/.exec(t);
  if (!m) return undefined;
  const inner = (m[1] ?? "").trim();
  const after = (m[2] ?? "").trim();
  const prompt = [inner, after].filter(Boolean).join(" ") || undefined;
  if (/date/i.test(inner)) return { kind: "date", prompt };
  if (/days|months|years/i.test(after)) return { kind: "duration", prompt };
  if (/#|number/i.test(inner)) return { kind: "number", prompt };
  if (inner === "") {
    return /no\.|how many|times|number/i.test(questionText) ? { kind: "number", prompt } : { kind: "text", prompt };
  }
  return { kind: "text", prompt };
}

export interface OptionToken {
  label: string;
  detail?: OptionDetail;
  staffInstruction?: string;
}

/** A long note in round brackets after an answer is an instruction for staff, not part of the answer. */
function splitInstruction(label: string): { label: string; staffInstruction?: string } {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(label);
  if (!m || (m[2] ?? "").trim().split(/\s+/).length < 4) return { label };
  return { label: (m[1] ?? "").trim() || label, staffInstruction: (m[2] ?? "").trim() };
}

/**
 * "Others[describe]" -> label "Others", detail text.
 * "Climbing Stairs [enter # of stairs]" -> label "Climbing Stairs", detail number.
 * "[describe]" inside a choice question -> label "Other", detail text.
 */
export function parseOptionToken(token: string): OptionToken {
  const m = /^(.*?)\s*\[(.*)\]\s*$/.exec(token.trim());
  if (!m) return splitInstruction(token.trim());
  const label = (m[1] ?? "").trim() || "Other";
  const inner = (m[2] ?? "").trim();
  const detail: OptionDetail = /#/.test(inner)
    ? { kind: "number", prompt: inner || undefined }
    : { kind: "text", prompt: inner || undefined };
  return { label, detail };
}
