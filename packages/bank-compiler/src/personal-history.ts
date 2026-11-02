/**
 * Parses the personal-history workbook (Habits, Gender Specific, Sleep, Diet & Exercise).
 *
 * Each sheet has a header row "# | Question | Type | Gender | Status | Required".
 * Choice questions (SINGLE-SELECT / MULTI-SELECT) have no options in the sheet; options come from
 * content/personal-history-options.yaml. Choice questions without options are left out and reported.
 */
import type { Option, Question } from "@setu/bank";
import type { Diagnostics } from "./diagnostics";
import type { Workbook } from "./read-xlsx";
import { slug, uniqueId } from "./slug";

const FILE = "personal-history.xlsx";

export type OptionsByQuestion = Record<string, Option[]>;

function yesNo(question: string): Option[] {
  return [
    { id: "yes", label: { en: "Yes" }, noteTemplate: `${question}: yes`, exclusive: false },
    { id: "no", label: { en: "No" }, noteTemplate: `${question}: no`, exclusive: false },
  ];
}

export function parsePersonalHistory(wb: Workbook, extraOptions: OptionsByQuestion, diag: Diagnostics): Question[] {
  const questions: Question[] = [];
  const ids = new Set<string>();

  for (const sheet of wb.sheets) {
    const header = sheet.rows.findIndex((r) => r.cells[0] === "#" && /question/i.test(r.cells[1] ?? ""));
    if (header < 0) {
      diag.warn(`${FILE} sheet "${sheet.name}"`, "No header row (# | Question | Type ...) found; sheet skipped.");
      continue;
    }
    for (const r of sheet.rows.slice(header + 1)) {
      const [num = "", rawText = "", type = "", gender = "", status = "", required = ""] = r.cells;
      if (!/^\d+$/.test(num) || !rawText) continue;
      const where = `${FILE} sheet "${sheet.name}" row ${r.row}`;
      if (status && !/^active$/i.test(status)) continue;

      let text = rawText;
      const sub = /\((\d+) sub-questions?\)/i.exec(text);
      if (sub) {
        text = text.replace(sub[0], "").trim();
        diag.warn(where, `"${text}" has ${sub[1]} sub-question(s) that are not in the sheet; please add them.`);
      }
      const label = text.replace(/[:?]\s*$/, "");
      const id = uniqueId(slug(`${sheet.name} ${label}`), ids);
      const sex: "male" | "female" | undefined = /^male$/i.test(gender) ? "male" : /^female$/i.test(gender) ? "female" : undefined;
      const base = {
        id,
        text: { en: text },
        required: /^required$/i.test(required),
        appliesTo: sex ? { sex } : undefined,
        source: { file: FILE, sheet: sheet.name, row: r.row },
      } as const;

      switch (type.toUpperCase()) {
        case "BOOLEAN":
          questions.push({ ...base, kind: "single", options: yesNo(label) });
          break;
        case "NUMBER":
          questions.push({ ...base, kind: "number", options: [], noteTemplate: `${label}: _` });
          break;
        case "DATE":
          questions.push({ ...base, kind: "date", options: [], noteTemplate: `${label}: _` });
          break;
        case "TEXT":
          questions.push({ ...base, kind: "text", options: [], noteTemplate: `${label}: _` });
          break;
        case "SINGLE-SELECT":
        case "MULTI-SELECT": {
          const options = extraOptions[rawText] ?? extraOptions[text];
          if (!options || options.length === 0) {
            diag.warn(where, `"${text}" (${type}) has no answer options; left out until they are added to personal-history-options.yaml.`);
            break;
          }
          questions.push({ ...base, kind: type.toUpperCase() === "MULTI-SELECT" ? "multi" : "single", options });
          break;
        }
        default:
          diag.warn(where, `Unknown question type "${type}"; skipped.`);
      }
    }
  }
  return questions;
}
