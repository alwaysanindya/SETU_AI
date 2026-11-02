/**
 * Turns one answer into note text using the templates from the sheet.
 *
 * Template rules (see docs/question-bank.md):
 *   "_"            replaced by the answer: the option label, the detail the patient gave, or the value
 *   "_/_", "+/-"   on a Yes/No question: "+" for yes, "-" for no ("Fever_/_" -> "Fever +")
 *   "No x/Y"       a Yes/No template with no "_": the half with "no" is used for No, the other for Yes
 *   "_ x _ cm"     several "_" in one template: filled in order from a value like "4 x 3"
 *   no "_"         used exactly as written ("did not move")
 *
 * Multi-select answers that share a template are merged:
 *   "Associated with sweating" + "Associated with extreme anxiety"
 *   -> "Associated with sweating and extreme anxiety"
 */
import type { Option, Question } from "@setu/bank";
import type { Answer } from "./state";

const SIDES: Record<string, string> = { R: "right", L: "left", C: "centre", B: "both sides" };

/**
 * Makes a button label read naturally inside a sentence.
 * "Upper(R)" -> "upper right", "Arm(L)" -> "left arm", "Difficulty in Breathing" -> "difficulty in breathing".
 * Words in capitals (TB, H/O) are kept as they are.
 */
export function humanizeLabel(label: string): string {
  let text = label.trim().replace(/^(.*?)\s*\(([RLCB])\)$/, (_m, base: string, side: string) => {
    const s = SIDES[side]!;
    if (side === "B") return `${base} on ${s}`;
    return /^(upper|lower|middle)$/i.test(base) ? `${base} ${s}` : `${s} ${base}`;
  });
  text = text
    .split(/(\s+)/)
    .map((w) => (/^[A-Z][a-z]/.test(w) ? w.toLowerCase() : w))
    .join("");
  return text;
}

/** "5 days", "1 day". Durations are stored in days. */
export function formatDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function tidy(text: string): string {
  return text
    .replace(/(\d)\s*days\b/g, "$1 days")
    .replace(/\b1 days\b/g, "1 day")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fills each "_" in turn. Missing parts show as "?" so the doctor sees the gap instead of a wrong number. */
function fillAll(template: string, parts: string[]): string {
  let i = 0;
  return template.replace(/_/g, () => parts[i++] ?? "?");
}

/** Puts a space around a lone "_" glued to a word ("Associated with_", "_times/day"). */
function spaceUnderscore(template: string): string {
  if (template.includes("_/_")) return template;
  return template.replace(/([A-Za-z])_/g, "$1 _").replace(/_([A-Za-z])/g, "_ $1");
}

function splitTopLevelSlash(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "/" && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

/** Note fragment for one chosen option. */
export function optionFragment(option: Option, detail: string | undefined): string {
  const tpl = option.noteTemplate.trim();
  const yes = option.id === "yes";
  const no = option.id === "no";

  if (yes || no) {
    const sign = yes ? "+" : "-";
    if (tpl.includes("_/_")) return tidy(tpl.replace("_/_", ` ${sign}`));
    if (tpl.includes("+/-")) return tidy(tpl.replace("+/-", ` ${sign}`));
    const leading = /^_\s+(.+)$/.exec(tpl); // "_ H/O alcohol" -> "H/O alcohol +"
    if (leading && !detail) return tidy(`${leading[1]} ${sign}`);
    if (!tpl.includes("_")) {
      const halves = splitTopLevelSlash(tpl);
      if (halves.length === 2 && halves.every((h) => h.length > 2)) {
        const noHalf = halves.findIndex((h) => /\bno\b/i.test(h));
        if (noHalf >= 0) return tidy(halves[no ? noHalf : 1 - noHalf]!);
      }
    }
  }

  if (!tpl.includes("_")) return tidy(tpl);
  const filler = detail?.trim() || humanizeLabel(option.label.en);
  const count = (tpl.match(/_/g) ?? []).length;
  if (count > 1) return tidy(fillAll(tpl, filler.split(/\s*[x×*,]\s*/i)));
  return tidy(spaceUnderscore(tpl).replace("_", filler));
}

/** Note fragment for a duration / number / date / text answer. */
export function valueFragment(question: Question, value: number | string): string {
  const tpl = spaceUnderscore(question.noteTemplate?.trim() || "_");
  if (question.kind === "duration" && typeof value === "number") {
    const hasUnit = /days?/.test(tpl);
    const text = hasUnit ? String(value) : `${formatDays(value)} ago`;
    return tidy(tpl.replace(/_/, text));
  }
  const count = (tpl.match(/_/g) ?? []).length;
  if (count > 1) return tidy(fillAll(tpl, String(value).split(/\s*[x×*,]\s*/i)));
  return tidy(tpl.replace("_", String(value)));
}

function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Note fragments for one answer. Multi-select options with the same template become one fragment.
 * A skipped answer becomes "<question>: not known" / "declined to answer".
 */
export function answerFragments(question: Question, answer: Answer): string[] {
  if (answer.skipped) {
    return [`${question.text.en.replace(/\?\s*$/, "")}: ${answer.skipped === "refused" ? "declined to answer" : "not known"}`];
  }
  if (question.options.length === 0 || !answer.optionIds) {
    return answer.value === undefined ? [] : [valueFragment(question, answer.value)];
  }

  const chosen = answer.optionIds
    .map((id) => question.options.find((o) => o.id === id))
    .filter((o): o is Option => o !== undefined);

  // Group options whose template has one "_" and is otherwise identical.
  const groups = new Map<string, string[]>();
  const out: string[] = [];
  for (const o of chosen) {
    const detail = answer.details?.[o.id];
    const tpl = spaceUnderscore(o.noteTemplate.trim());
    const mergeable = question.kind === "multi" && (tpl.match(/_/g) ?? []).length === 1 && !tpl.includes("_/_") && o.id !== "yes" && o.id !== "no";
    if (!mergeable) {
      out.push(optionFragment(o, detail));
      continue;
    }
    const key = tpl;
    if (!groups.has(key)) {
      groups.set(key, []);
      out.push(key); // placeholder keeps the order of first appearance
    }
    groups.get(key)!.push(detail?.trim() || humanizeLabel(o.label.en));
  }
  return out.map((f) => (groups.has(f) ? tidy(f.replace("_", joinWords(groups.get(f)!))) : f));
}
