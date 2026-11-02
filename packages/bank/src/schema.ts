/**
 * The compiled question bank format.
 *
 * The bank is produced by `@setu/bank-compiler` from the clinician spreadsheets in
 * `content/source/` plus the hand-written files in `content/` (red flags, codes,
 * past history, corrections). Everything downstream (engine, server, app) reads
 * only this format, so this file is the single contract between them.
 *
 * Ids are stable slugs derived from the spreadsheet text (e.g. "chest-pain",
 * "where-did-it-start"). Changing wording in the sheet changes the id, which the
 * compiler reports in its diff so stored interviews can be migrated.
 */
import { z } from "zod";

/** Languages the app supports. English is always required; others are filled in by reviewed translations. */
export const LANGS = ["en", "bn", "hi"] as const;
export const Lang = z.enum(LANGS);
export type Lang = z.infer<typeof Lang>;

/** Text in several languages. `en` is the source; `bn`/`hi` are added after clinician + native-speaker review. */
export const LocalizedText = z.object({
  en: z.string().min(1),
  bn: z.string().optional(),
  hi: z.string().optional(),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Where an item came from, so every warning and every summary line can be traced back to the sheet. */
export const SourceRef = z.object({
  file: z.string(),
  sheet: z.string().optional(),
  row: z.number().int().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/**
 * How a question is answered.
 * - single:   pick exactly one option
 * - multi:    pick one or more options ("Any associated symptoms?")
 * - duration: a number of days (sheet answer "_days")
 * - number:   any count ("[number]", "_freq", "[enter # ...]")
 * - date:     a calendar date ("[date]")
 * - text:     free description ("[describe]")
 */
export const AnswerKind = z.enum(["single", "multi", "duration", "number", "date", "text"]);
export type AnswerKind = z.infer<typeof AnswerKind>;

/** Extra input attached to an option, e.g. "Others[describe]" or "Climbing Stairs [enter # of stairs]". */
export const OptionDetail = z.object({
  kind: z.enum(["text", "number"]),
  /** Hint shown to the patient or staff, taken from inside the brackets. */
  prompt: z.string().optional(),
});
export type OptionDetail = z.infer<typeof OptionDetail>;

/** Clinical codes. All codes must be signed off by a clinician; `verified` records that sign-off. */
export const Codes = z.object({
  icd10Who: z.object({ code: z.string(), display: z.string() }).optional(),
  snomedCt: z.object({ code: z.string(), display: z.string() }).optional(),
  verified: z.boolean().default(false),
});
export type Codes = z.infer<typeof Codes>;

export const Option = z.object({
  id: z.string(),
  label: LocalizedText,
  /**
   * Note fragment for this option. "_" is replaced by the option label (or by the
   * detail the patient gave). A template without "_" is used as written.
   */
  noteTemplate: z.string(),
  detail: OptionDetail.optional(),
  /**
   * An instruction for staff written next to this answer in the sheet, e.g.
   * "Yes (Send patient immediately to nearest hospital after bandaging the part!)".
   * Shown to staff and in the doctor summary, never read to the patient.
   */
  staffInstruction: z.string().optional(),
  /** In a multi-select, choosing this clears the others ("None"). */
  exclusive: z.boolean().default(false),
  /** Choosing this option adds another complaint to the interview (sheet "~Chest Pain"). */
  triggersComplaint: z.string().optional(),
  source: SourceRef.optional(),
});
export type Option = z.infer<typeof Option>;

export const Question = z.object({
  id: z.string(),
  text: LocalizedText,
  kind: AnswerKind,
  options: z.array(Option).default([]),
  /** Note template for duration/number/date/text questions. */
  noteTemplate: z.string().optional(),
  /** Only ask this question for this sex (from the personal-history sheet). */
  appliesTo: z.object({ sex: z.enum(["male", "female"]).optional() }).optional(),
  required: z.boolean().default(true),
  source: SourceRef.optional(),
});
export type Question = z.infer<typeof Question>;

export const Complaint = z.object({
  id: z.string(),
  /** Chief complaint group shown on the first picture grid, e.g. "pain". */
  groupId: z.string(),
  name: LocalizedText,
  questions: z.array(Question),
  codes: Codes.optional(),
  source: SourceRef.optional(),
});
export type Complaint = z.infer<typeof Complaint>;

export const ComplaintGroup = z.object({
  id: z.string(),
  name: LocalizedText,
  complaintIds: z.array(z.string()).min(1),
});
export type ComplaintGroup = z.infer<typeof ComplaintGroup>;

/** A non-complaint block of questions: past medical history, personal history. */
export const Section = z.object({
  id: z.string(),
  title: LocalizedText,
  questions: z.array(Question),
});
export type Section = z.infer<typeof Section>;

/**
 * A condition over answers. Red-flag rules are trees of these.
 * `optionIn` matches if any listed option was chosen for that question.
 */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { answer: { complaint: string; question: string; optionIn: string[] } }
  | { numberAtLeast: { complaint: string; question: string; value: number } }
  | { patient: { ageUnder?: number; ageAtLeast?: number; sex?: "male" | "female" } };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(Condition).min(1) }),
    z.object({ any: z.array(Condition).min(1) }),
    z.object({
      answer: z.object({ complaint: z.string(), question: z.string(), optionIn: z.array(z.string()).min(1) }),
    }),
    z.object({
      numberAtLeast: z.object({ complaint: z.string(), question: z.string(), value: z.number() }),
    }),
    z.object({
      patient: z.object({
        ageUnder: z.number().optional(),
        ageAtLeast: z.number().optional(),
        sex: z.enum(["male", "female"]).optional(),
      }),
    }),
  ]),
);

export const RedFlagRule = z.object({
  id: z.string(),
  /** Shown to the doctor and staff. Never shown to the patient. */
  message: z.string(),
  when: Condition,
  /** Set to true only after a named clinician signs the rule off. */
  approved: z.boolean().default(false),
});
export type RedFlagRule = z.infer<typeof RedFlagRule>;

export const Bank = z.object({
  /** Content hash of all inputs; stored with each interview. */
  version: z.string(),
  compiledAt: z.string(),
  groups: z.array(ComplaintGroup),
  complaints: z.array(Complaint),
  pastHistory: Section,
  personalHistory: Section,
  redFlags: z.array(RedFlagRule),
  /** Complaints that jump to the front of the queue when triggered (e.g. chest pain). */
  urgentComplaints: z.array(z.string()).default([]),
});
export type Bank = z.infer<typeof Bank>;
