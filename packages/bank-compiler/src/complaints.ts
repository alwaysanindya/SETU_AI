/**
 * Parses the "Chief Complaints" sheet.
 *
 * Column layout (header on row 1):
 *   A Chief complaint group  (filled on the first row of each group, e.g. "Pain")
 *   B Complaint              (filled on the first row of each complaint, e.g. "Headache")
 *   C Question               (filled on the first row of each question)
 *   D Possible answers       (see answers.ts)
 *   E History note format    ("_" = the answer; "~Name" at the end = also ask about complaint "Name")
 *
 * A row with an empty question column adds more answers to the question above it.
 * Each such row can have its own note template, e.g. "Did not move" -> "did not move".
 */
import type { Complaint, Option, Question } from "@setu/bank";
import { parseOptionToken, parseValueToken, splitAnswers } from "./answers";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
import type { Diagnostics } from "./diagnostics";
import type { SheetRow } from "./read-xlsx";
import { slug, uniqueId } from "./slug";

const FILE = "complaints.xlsx";

export interface ComplaintCorrections {
  /** complaint id -> "Question text#occurrence" -> replacement text */
  questionRenames?: Record<string, Record<string, string>>;
}

interface RawQuestion {
  text: string;
  row: number;
  answerRows: { row: number; answers: string; template: string }[];
}

interface RawComplaint {
  name: string;
  group: string;
  row: number;
  questions: RawQuestion[];
}

/** Complaint as parsed, with "~Name" links still as names (resolved later in compile.ts). */
export type ParsedComplaint = Omit<Complaint, "questions"> & {
  questions: (Omit<Question, "options"> & { options: (Option & { triggerName?: string })[] })[];
};

export interface ParsedComplaints {
  complaints: ParsedComplaint[];
  groups: { id: string; name: string; complaintIds: string[] }[];
}

const MULTI_SELECT = /associated|other symptom/i;
const EXCLUSIVE = /^(none|nil|no|did not move|has not moved|same place)$/i;

function groupRows(rows: SheetRow[], diag: Diagnostics): RawComplaint[] {
  const out: RawComplaint[] = [];
  let group = "";
  let complaint: RawComplaint | undefined;
  let question: RawQuestion | undefined;

  for (const r of rows.slice(1)) {
    const [g = "", c = "", q = "", a = "", e = ""] = r.cells;
    if (g) group = g;
    if (c) {
      complaint = { name: c, group, row: r.row, questions: [] };
      out.push(complaint);
      question = undefined;
    }
    if (!complaint) {
      diag.warn(`${FILE} row ${r.row}`, "Row before the first complaint; skipped.");
      continue;
    }
    if (q) {
      question = { text: q, row: r.row, answerRows: [] };
      complaint.questions.push(question);
    }
    if (!question) {
      diag.warn(`${FILE} row ${r.row}`, "Answer row before the first question; skipped.", slug(complaint.name));
      continue;
    }
    if (a || e) question.answerRows.push({ row: r.row, answers: a, template: e });
  }
  return out;
}

/** "~Chest Pain" at the end of a template means "also ask about Chest Pain". */
function splitTrigger(template: string): { template: string; triggerName?: string } {
  const m = /^(.*?)~\s*(.+)$/.exec(template);
  if (!m) return { template };
  return { template: (m[1] ?? "").trim(), triggerName: (m[2] ?? "").trim() };
}

function parseQuestion(
  raw: RawQuestion,
  complaintId: string,
  questionId: string,
  diag: Diagnostics,
): ParsedComplaint["questions"][number] | undefined {
  const where = `${FILE} row ${raw.row}`;
  const source = { file: FILE, sheet: "Chief Complaints", row: raw.row };

  if (raw.answerRows.length === 0) {
    diag.warn(where, `"${raw.text}" has no answers or note template; treated as a heading and skipped.`, complaintId);
    return undefined;
  }

  const options: (Option & { triggerName?: string })[] = [];
  const optionIds = new Set<string>();
  let valueKind: ReturnType<typeof parseValueToken>;
  let valueTemplate: string | undefined;

  for (const ar of raw.answerRows) {
    const rowWhere = `${FILE} row ${ar.row}`;
    if (!ar.answers) {
      diag.warn(rowWhere, `Note template "${ar.template}" has no answer next to it; skipped.`, complaintId);
      continue;
    }
    // Whole-cell value entries ("[date] *either calendar or dd/mm/yyyy", "[] days/months/years") are not lists.
    const wholeValue = parseValueToken(ar.answers, raw.text);
    const isInstruction = words(ar.answers) > 4 || /-\s*$/.test(ar.answers) || /^if\b/i.test(ar.answers);
    if (!ar.template && !wholeValue && !ar.answers.includes(";") && isInstruction) {
      diag.warn(rowWhere, `"${ar.answers}" looks like an instruction, not an answer; skipped. Move it to the question text or a staff note.`, complaintId);
      continue;
    }
    const split = wholeValue ? { parts: [ar.answers], droppedEmpty: false, unusualSeparator: undefined } : splitAnswers(ar.answers);
    if (split.unusualSeparator) {
      diag.warn(rowWhere, `Answers "${ar.answers}" are separated by "${split.unusualSeparator}" instead of ";".`, complaintId);
    }
    if (split.droppedEmpty) diag.warn(rowWhere, `Empty answer in "${ar.answers}" (extra ";"?) ignored.`, complaintId);

    const { template: rowTemplate0, triggerName } = splitTrigger(ar.template);
    let rowTemplate = rowTemplate0;
    if (!rowTemplate) {
      diag.warn(rowWhere, `No note template for "${ar.answers}"; the answer itself will be used.`, complaintId);
      rowTemplate = "_";
    } else if (rowTemplate === ar.answers && split.parts.length > 1) {
      rowTemplate = "_"; // template just repeats the options list
    }

    // "Married;Unmarried" next to "Yes;No": one template per option.
    const perOption = rowTemplate.includes(";") ? rowTemplate.split(";").map((s) => s.trim()) : undefined;
    if (perOption && perOption.length !== split.parts.length) {
      diag.warn(rowWhere, `Template "${rowTemplate}" has ${perOption.length} parts but there are ${split.parts.length} answers.`, complaintId);
    }

    split.parts.forEach((token, i) => {
      const value = parseValueToken(token, raw.text);
      if (value && split.parts.length === 1 && options.length === 0) {
        if (valueKind && valueKind.kind !== value.kind) {
          diag.warn(rowWhere, `Mixes "${valueKind.kind}" and "${value.kind}" answers.`, complaintId);
        }
        valueKind = value;
        valueTemplate = rowTemplate;
        return;
      }
      const parsed = parseOptionToken(token);
      const baseId = slug(parsed.label);
      if (optionIds.has(baseId)) {
        diag.warn(rowWhere, `Answer "${parsed.label}" appears twice in "${raw.text}"; the second gets a new id.`, complaintId);
      }
      const id = uniqueId(baseId, optionIds);
      options.push({
        id,
        label: { en: parsed.label },
        noteTemplate: perOption?.[i] ?? rowTemplate,
        detail: parsed.detail,
        staffInstruction: parsed.staffInstruction,
        exclusive: false,
        triggerName,
        source: { file: FILE, sheet: "Chief Complaints", row: ar.row },
      });
    });
  }

  if (valueKind && options.length > 0) {
    diag.warn(where, `"${raw.text}" mixes a ${valueKind.kind} entry with answer options; the entry becomes an "Other" option.`, complaintId);
    options.push({
      id: uniqueId("other", optionIds),
      label: { en: "Other" },
      noteTemplate: valueTemplate ?? "_",
      detail: { kind: valueKind.kind === "number" ? "number" : "text", prompt: valueKind.prompt },
      exclusive: false,
    });
    valueKind = undefined;
  }

  if (valueKind) {
    return {
      id: questionId,
      text: { en: raw.text },
      kind: valueKind.kind,
      options: [],
      noteTemplate: valueTemplate,
      required: true,
      source,
    };
  }

  if (options.length === 0) {
    diag.warn(where, `"${raw.text}" has no usable answers; skipped.`, complaintId);
    return undefined;
  }

  for (const o of options) {
    if (o.label.en.includes(",")) diag.warn(where, `Answer "${o.label.en}" contains a comma; should it be two answers separated by ";"?`, complaintId);
    else if (o.label.en.length > 30) diag.warn(where, `Answer "${o.label.en}" is long for a button; is it an instruction?`, complaintId);
  }

  const ids = options.map((o) => o.id);
  const yesNoOnly = ids.length === 2 && ids.includes("yes") && ids.includes("no");
  const kind = MULTI_SELECT.test(raw.text) && !yesNoOnly ? "multi" : "single";
  if (kind === "multi") for (const o of options) o.exclusive = EXCLUSIVE.test(o.label.en);

  if (ids.includes("yes") && ids.includes("no") && options.length > 2) {
    diag.warn(where, `Yes/No question "${raw.text}" has extra answers (${ids.filter((x) => x !== "yes" && x !== "no").join(", ")}). Check that rows below it belong to it.`, complaintId);
  }
  return { id: questionId, text: { en: raw.text }, kind, options, required: true, source };
}

export function parseComplaints(rows: SheetRow[], diag: Diagnostics, corrections: ComplaintCorrections = {}): ParsedComplaints {
  const raws = groupRows(rows, diag);
  const complaintIds = new Set<string>();
  const complaints: ParsedComplaint[] = [];
  const groups = new Map<string, { id: string; name: string; complaintIds: string[] }>();

  for (const rc of raws) {
    const baseId = slug(rc.name);
    if (complaintIds.has(baseId)) diag.warn(`${FILE} row ${rc.row}`, `Complaint "${rc.name}" appears twice.`, baseId);
    const id = uniqueId(baseId, complaintIds);
    const groupId = slug(rc.group) || "other";

    const renames = corrections.questionRenames?.[id] ?? {};
    const seen = new Map<string, number>();
    const questionIds = new Set<string>();
    const questions: ParsedComplaint["questions"] = [];

    for (const rq of rc.questions) {
      const n = (seen.get(rq.text) ?? 0) + 1;
      seen.set(rq.text, n);
      const rename = renames[`${rq.text}#${n}`];
      if (rename) {
        diag.corrected(`${FILE} row ${rq.row}`, `Question "${rq.text}" (occurrence ${n}) renamed to "${rename}" (corrections.yaml).`, id);
        rq.text = rename;
      }
      const qBase = slug(rq.text);
      if (questionIds.has(qBase)) diag.warn(`${FILE} row ${rq.row}`, `Question "${rq.text}" appears twice in "${rc.name}".`, id);
      const qid = uniqueId(qBase, questionIds);
      const q = parseQuestion(rq, id, qid, diag);
      if (q) questions.push(q);
    }

    complaints.push({ id, groupId, name: { en: rc.name }, questions, source: { file: FILE, sheet: "Chief Complaints", row: rc.row } });
    const g = groups.get(groupId) ?? { id: groupId, name: rc.group || "Other", complaintIds: [] };
    g.complaintIds.push(id);
    groups.set(groupId, g);
  }

  return { complaints, groups: [...groups.values()] };
}
