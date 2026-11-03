/**
 * Builds the bank from the content folder. This is the only place that knows the content file layout.
 *
 * Steps:
 *  1. read the spreadsheets and YAML files
 *  2. parse complaints and personal history
 *  3. resolve "~Name" links to complaint ids (using corrections.yaml aliases)
 *  4. attach codes, order groups, load past history
 *  5. check every red-flag rule points at a real complaint, question and option
 *  6. validate the whole bank against the schema
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Bank, Codes, type Condition, RedFlagRule, Section, type Complaint, type Option, type Question } from "@setu/bank";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { parseComplaints, type ComplaintCorrections } from "./complaints";
import { Diagnostics } from "./diagnostics";
import { parsePersonalHistory, type OptionsByQuestion } from "./personal-history";
import { readWorkbook } from "./read-xlsx";
import { slug } from "./slug";

export const CONTENT_FILES = {
  complaints: "source/complaints.xlsx",
  personalHistory: "source/personal-history.xlsx",
  personalHistoryOptions: "personal-history-options.yaml",
  pastHistory: "past-history.yaml",
  redFlags: "red-flags.yaml",
  codes: "codes.yaml",
  corrections: "corrections.yaml",
  groups: "groups.yaml",
  translations: "translations.yaml",
} as const;

const CorrectionsFile = z.object({
  complaintAliases: z.record(z.string(), z.string()).default({}),
  questionRenames: z.record(z.string(), z.record(z.string(), z.string())).default({}),
});
const RedFlagsFile = z.object({
  urgentComplaints: z.array(z.string()).default([]),
  rules: z.array(RedFlagRule),
});
const CodesFile = z.object({ complaints: z.record(z.string(), Codes) });
const GroupsFile = z.object({ order: z.array(z.string()) });
const Tr = z.object({ bn: z.string().optional(), hi: z.string().optional() });
const QuestionTr = z.object({ text: Tr.optional(), options: z.record(z.string(), Tr).default({}) });
const TranslationsFile = z.object({
  groups: z.record(z.string(), Tr).default({}),
  complaints: z.record(z.string(), z.object({ name: Tr.optional(), questions: z.record(z.string(), QuestionTr).default({}) })).default({}),
  sections: z.record(z.string(), z.object({ title: Tr.optional(), questions: z.record(z.string(), QuestionTr).default({}) })).default({}),
});
type TranslationsFile = z.infer<typeof TranslationsFile>;
type QuestionTr = z.infer<typeof QuestionTr>;

const OptionsFile = z.object({ options: z.record(z.string(), z.array(z.any())).default({}) });

/**
 * Adds Bengali and Hindi text from translations.yaml to questions and options, matched by id.
 * Unknown ids are reported (usually a question was renamed in the sheet); missing text falls back to English.
 */
function applyQuestionTranslations(questions: Question[], tr: Record<string, QuestionTr>, where: string, diag: Diagnostics, owner?: string) {
  for (const [qid, qtr] of Object.entries(tr)) {
    const q = questions.find((x) => x.id === qid);
    if (!q) {
      diag.warn(`${CONTENT_FILES.translations} ${where}`, `Translation for unknown question "${qid}"; ignored.`, owner);
      continue;
    }
    Object.assign(q.text, qtr.text);
    for (const [oid, otr] of Object.entries(qtr.options)) {
      const o = q.options.find((x) => x.id === oid);
      if (!o) diag.warn(`${CONTENT_FILES.translations} ${where}`, `Translation for unknown answer "${oid}" in "${qid}"; ignored.`, owner);
      else Object.assign(o.label, otr);
    }
  }
}

function countMissing(questions: Question[]): number {
  let n = 0;
  for (const q of questions) {
    if (!q.text.bn || !q.text.hi) n++;
    for (const o of q.options) if (!o.label.bn || !o.label.hi) n++;
  }
  return n;
}

export interface CompileResult {
  bank: Bank | undefined;
  diagnostics: Diagnostics;
}

async function loadYaml<T>(contentDir: string, file: string, schema: z.ZodType<T>, diag: Diagnostics): Promise<T | undefined> {
  try {
    const text = await readFile(join(contentDir, file), "utf8");
    const parsed = schema.safeParse(parseYaml(text) ?? {});
    if (!parsed.success) {
      diag.error(file, `Invalid format: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      return undefined;
    }
    return parsed.data;
  } catch (e) {
    diag.error(file, `Could not read: ${(e as Error).message}`);
    return undefined;
  }
}

async function hashFiles(contentDir: string): Promise<string> {
  const h = createHash("sha256");
  for (const f of Object.values(CONTENT_FILES)) {
    h.update(f);
    h.update(await readFile(join(contentDir, f)));
  }
  return h.digest("hex").slice(0, 12);
}

/** Checks one red-flag condition refers to things that exist. */
function checkCondition(cond: Condition, complaints: Complaint[], where: string, diag: Diagnostics) {
  if ("all" in cond) return cond.all.forEach((c) => checkCondition(c, complaints, where, diag));
  if ("any" in cond) return cond.any.forEach((c) => checkCondition(c, complaints, where, diag));
  if ("patient" in cond) return;
  const ref = "answer" in cond ? cond.answer : cond.numberAtLeast;
  const complaint = complaints.find((c) => c.id === ref.complaint);
  if (!complaint) return diag.error(where, `Unknown complaint "${ref.complaint}".`);
  const question = complaint.questions.find((q) => q.id === ref.question);
  if (!question) return diag.error(where, `Unknown question "${ref.question}" in "${ref.complaint}".`, complaint.id);
  if ("answer" in cond) {
    for (const o of cond.answer.optionIn) {
      if (!question.options.some((x) => x.id === o)) {
        diag.error(where, `Unknown option "${o}" in ${ref.complaint} > ${ref.question}. Options: ${question.options.map((x) => x.id).join(", ")}.`, complaint.id);
      }
    }
  } else if (question.kind !== "number" && question.kind !== "duration") {
    diag.error(where, `numberAtLeast used on "${ref.question}", which is a ${question.kind} question.`, complaint.id);
  }
}

export async function compileBank(contentDir: string, now = new Date()): Promise<CompileResult> {
  const diag = new Diagnostics();

  const corrections = (await loadYaml(contentDir, CONTENT_FILES.corrections, CorrectionsFile, diag)) ?? {
    complaintAliases: {},
    questionRenames: {},
  };
  const redFlagsFile = await loadYaml(contentDir, CONTENT_FILES.redFlags, RedFlagsFile, diag);
  const codesFile = await loadYaml(contentDir, CONTENT_FILES.codes, CodesFile, diag);
  const groupsFile = await loadYaml(contentDir, CONTENT_FILES.groups, GroupsFile, diag);
  const pastHistory = await loadYaml(contentDir, CONTENT_FILES.pastHistory, Section, diag);
  const optionsFile = await loadYaml(contentDir, CONTENT_FILES.personalHistoryOptions, OptionsFile, diag);
  const translations: TranslationsFile = (await loadYaml(contentDir, CONTENT_FILES.translations, TranslationsFile, diag)) ?? {
    groups: {},
    complaints: {},
    sections: {},
  };

  // 1-2. Spreadsheets
  const complaintsWb = await readWorkbook(join(contentDir, CONTENT_FILES.complaints));
  const sheet = complaintsWb.sheets.find((s) => /chief complaints/i.test(s.name)) ?? complaintsWb.sheets[0];
  if (!sheet) {
    diag.error(CONTENT_FILES.complaints, "No worksheet found.");
    return { bank: undefined, diagnostics: diag };
  }
  const parsed = parseComplaints(sheet.rows, diag, corrections as ComplaintCorrections);

  const personalWb = await readWorkbook(join(contentDir, CONTENT_FILES.personalHistory));
  const personalQuestions = parsePersonalHistory(personalWb, (optionsFile?.options ?? {}) as OptionsByQuestion, diag);

  // 3. Resolve "~Name" links
  const byName = new Map(parsed.complaints.map((c) => [slug(c.name.en), c.id]));
  const aliases = new Map(Object.entries(corrections.complaintAliases).map(([k, v]) => [slug(k), slug(v)]));
  const complaints: Complaint[] = parsed.complaints.map((c) => ({
    ...c,
    questions: c.questions.map((q) => ({
      ...q,
      options: q.options.map(({ triggerName, ...o }): Option => {
        if (!triggerName) return o;
        let target = byName.get(slug(triggerName));
        if (!target && aliases.has(slug(triggerName))) {
          target = byName.get(aliases.get(slug(triggerName))!);
          if (target) diag.corrected(`complaints.xlsx row ${o.source?.row}`, `Link "~${triggerName}" read as "${target}" (corrections.yaml).`, c.id);
        }
        if (!target) {
          diag.error(`complaints.xlsx row ${o.source?.row}`, `Link "~${triggerName}" does not match any complaint name. Fix the sheet or add an alias in corrections.yaml.`, c.id);
          return o;
        }
        return { ...o, triggersComplaint: target };
      }),
    })),
  }));

  // 4. Codes, groups
  for (const [id, codes] of Object.entries(codesFile?.complaints ?? {})) {
    const c = complaints.find((x) => x.id === id);
    if (!c) diag.error(CONTENT_FILES.codes, `Codes given for unknown complaint "${id}".`);
    else c.codes = codes;
  }
  for (const c of complaints) {
    if (!c.codes) diag.warn(CONTENT_FILES.codes, `No codes for complaint "${c.id}".`, c.id);
  }
  const order = groupsFile?.order ?? [];
  const groups = [...parsed.groups].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const g of groups) if (!order.includes(g.id)) diag.warn(CONTENT_FILES.groups, `Group "${g.id}" is not listed in order; shown last.`);
  for (const id of order) if (!groups.some((g) => g.id === id)) diag.warn(CONTENT_FILES.groups, `Group "${id}" in order does not exist.`);

  // 4b. Translations (draft until reviewed by native speakers)
  for (const [id, ctr] of Object.entries(translations.complaints)) {
    const c = complaints.find((x) => x.id === id);
    if (!c) {
      diag.warn(CONTENT_FILES.translations, `Translation for unknown complaint "${id}"; ignored.`);
      continue;
    }
    Object.assign(c.name, ctr.name);
    applyQuestionTranslations(c.questions, ctr.questions, `complaint ${id}`, diag, id);
  }
  const personalSection = { id: "personal-history", title: { en: "Personal history" } as Section["title"], questions: personalQuestions };
  const pastSection = pastHistory ?? { id: "past-history", title: { en: "Past medical history" }, questions: [] };
  for (const section of [pastSection, personalSection]) {
    const str = translations.sections[section.id];
    if (!str) continue;
    Object.assign(section.title, str.title);
    applyQuestionTranslations(section.questions, str.questions, `section ${section.id}`, diag);
  }
  const groupNames = new Map(groups.map((g) => [g.id, { en: g.name, ...translations.groups[g.id] }]));
  const missing = complaints.reduce((n, c) => n + countMissing(c.questions), 0) + countMissing(pastSection.questions) + countMissing(personalSection.questions);
  if (missing > 0) diag.warn(CONTENT_FILES.translations, `${missing} questions or answers have no Bengali or Hindi text yet; English is shown instead.`);

  // 5. Red flags
  for (const rule of redFlagsFile?.rules ?? []) {
    checkCondition(rule.when, complaints, `red-flags.yaml rule ${rule.id}`, diag);
    if (!rule.approved) diag.warn(`red-flags.yaml rule ${rule.id}`, "Not yet approved by a clinician.");
  }
  for (const id of redFlagsFile?.urgentComplaints ?? []) {
    if (!complaints.some((c) => c.id === id)) diag.error(CONTENT_FILES.redFlags, `urgentComplaints lists unknown complaint "${id}".`);
  }

  // 6. Assemble and validate
  const candidate = {
    version: await hashFiles(contentDir),
    compiledAt: now.toISOString(),
    groups: groups.map((g) => ({ id: g.id, name: groupNames.get(g.id)!, complaintIds: g.complaintIds })),
    complaints,
    pastHistory: pastSection,
    personalHistory: personalSection,
    redFlags: redFlagsFile?.rules ?? [],
    urgentComplaints: redFlagsFile?.urgentComplaints ?? [],
  };
  const result = Bank.safeParse(candidate);
  if (!result.success) {
    for (const issue of result.error.issues) diag.error("bank.json", `${issue.path.join(".")}: ${issue.message}`);
  }
  return { bank: diag.errors.length === 0 && result.success ? result.data : undefined, diagnostics: diag };
}
