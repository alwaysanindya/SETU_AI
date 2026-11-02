/**
 * The two outputs of an interview:
 *  1. coded complaints: each complaint the patient reported, with its draft WHO ICD-10 / SNOMED CT code
 *  2. the doctor summary: red flags first, then complaint history, past history, personal history
 *
 * Everything here is derived from the bank and the interview state; nothing is stored separately.
 * Codes describe what the PATIENT REPORTED, never a diagnosis, and say so.
 */
import type { Bank, Codes, Question, Section } from "@setu/bank";
import { getComplaint } from "@setu/bank";
import { applies } from "./flow";
import { answerFragments } from "./note";
import { answerKey, PAST_HISTORY, PERSONAL_HISTORY, type InterviewState, type Patient, type Scope } from "./state";

export interface CodedComplaint {
  complaintId: string;
  name: string;
  codes?: Codes;
  /** Always "patient-reported": the code records the complaint, not a diagnosis. */
  basis: "patient-reported";
}

export interface SummaryLine {
  questionId: string;
  question: string;
  text: string;
}

export interface ComplaintHistory {
  complaintId: string;
  name: string;
  /** One readable sentence, e.g. "Chest pain: 3 days, started upper centre, sudden onset, ..." */
  text: string;
  lines: SummaryLine[];
}

export interface UncertainAnswer {
  scope: Scope;
  questionId: string;
  question: string;
  recordedAs: string;
  heard?: string;
  confidence: "medium" | "low";
}

export interface DoctorSummary {
  bankVersion: string;
  patient: Patient;
  redFlags: { ruleId: string; message: string; approved: boolean; acknowledgedBy?: string }[];
  /** Instructions written next to answers in the sheet ("Send patient immediately to nearest hospital ..."). */
  staffInstructions: string[];
  codedComplaints: CodedComplaint[];
  complaintHistory: ComplaintHistory[];
  pastHistory: SummaryLine[];
  personalHistory: SummaryLine[];
  /** Voice answers the system was not sure about. The doctor should confirm these. */
  uncertain: UncertainAnswer[];
  /** False until the patient confirmed the review screen. */
  confirmed: boolean;
}

function lines(questions: Question[], scope: Scope, state: InterviewState): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const q of questions) {
    if (!applies(q, state)) continue;
    const a = state.answers[answerKey(scope, q.id)];
    if (!a) continue;
    for (const text of answerFragments(q, a)) out.push({ questionId: q.id, question: q.text.en, text });
  }
  return out;
}

function sectionOf(bank: Bank, scope: typeof PAST_HISTORY | typeof PERSONAL_HISTORY): Section {
  return scope === PAST_HISTORY ? bank.pastHistory : bank.personalHistory;
}

/** "Associated with x" -> "associated with x" inside a sentence; "H/O", "TB" stay as written. */
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildSummary(bank: Bank, state: InterviewState): DoctorSummary {
  const redFlags = state.redFlags.map((f) => {
    const rule = bank.redFlags.find((r) => r.id === f.ruleId);
    return { ruleId: f.ruleId, message: rule?.message ?? f.ruleId, approved: rule?.approved ?? false, acknowledgedBy: f.acknowledgedBy };
  });

  const staffInstructions: string[] = [];
  const uncertain: UncertainAnswer[] = [];
  const scopes: { scope: Scope; questions: Question[] }[] = [
    ...state.complaints.map((id) => ({ scope: id, questions: getComplaint(bank, id).questions })),
    ...([PAST_HISTORY, PERSONAL_HISTORY] as const).map((s) => ({ scope: s, questions: sectionOf(bank, s).questions })),
  ];
  for (const { scope, questions } of scopes) {
    for (const q of questions) {
      const a = state.answers[answerKey(scope, q.id)];
      if (!a) continue;
      for (const id of a.optionIds ?? []) {
        const instr = q.options.find((o) => o.id === id)?.staffInstruction;
        if (instr && !staffInstructions.includes(instr)) staffInstructions.push(instr);
      }
      if (a.source === "voice" && (a.confidence === "low" || a.confidence === "medium")) {
        uncertain.push({
          scope,
          questionId: q.id,
          question: q.text.en,
          recordedAs: answerFragments(q, a).join("; "),
          heard: a.transcript,
          confidence: a.confidence,
        });
      }
    }
  }

  const codedComplaints: CodedComplaint[] = state.complaints.map((id) => {
    const c = getComplaint(bank, id);
    return { complaintId: id, name: c.name.en, codes: c.codes, basis: "patient-reported" };
  });

  const complaintHistory: ComplaintHistory[] = state.complaints.map((id) => {
    const c = getComplaint(bank, id);
    const ls = lines(c.questions, id, state);
    const body = ls.map((l) => lowerFirst(l.text)).join(", ");
    return { complaintId: id, name: c.name.en, lines: ls, text: body ? `${c.name.en}: ${body}.` : `${c.name.en}.` };
  });

  return {
    bankVersion: state.bankVersion,
    patient: state.patient,
    redFlags,
    staffInstructions,
    codedComplaints,
    complaintHistory,
    pastHistory: lines(bank.pastHistory.questions, PAST_HISTORY, state),
    personalHistory: lines(bank.personalHistory.questions, PERSONAL_HISTORY, state),
    uncertain,
    confirmed: state.confirmed,
  };
}

function codeText(codes: Codes | undefined): string {
  if (!codes?.icd10Who && !codes?.snomedCt) return "not coded";
  const parts: string[] = [];
  if (codes.snomedCt) parts.push(`SNOMED CT ${codes.snomedCt.code} ${codes.snomedCt.display}`);
  if (codes.icd10Who) parts.push(`ICD-10 ${codes.icd10Who.code} ${codes.icd10Who.display}`);
  return parts.join(" | ") + (codes.verified ? "" : " (draft code, not yet verified)");
}

/** Plain-text version of the summary, for printing or pasting into another record system. */
export function renderSummaryText(s: DoctorSummary): string {
  const out: string[] = [];
  const who = [s.patient.ageYears !== undefined ? `${s.patient.ageYears} y` : undefined, s.patient.sex].filter(Boolean).join(", ");
  out.push(`SETU history summary${who ? ` (${who})` : ""}`);
  if (!s.confirmed) out.push("NOT YET CONFIRMED BY PATIENT");
  out.push("");

  if (s.redFlags.length > 0) {
    out.push("RED FLAGS");
    for (const f of s.redFlags) out.push(`! ${f.message}${f.approved ? "" : " [draft rule]"}${f.acknowledgedBy ? ` (seen by ${f.acknowledgedBy})` : ""}`);
    out.push("");
  }
  if (s.staffInstructions.length > 0) {
    out.push("STAFF INSTRUCTIONS");
    for (const i of s.staffInstructions) out.push(`! ${i}`);
    out.push("");
  }

  out.push("PRESENTING COMPLAINTS (patient-reported, not a diagnosis)");
  for (const c of s.codedComplaints) out.push(`- ${c.name}: ${codeText(c.codes)}`);
  out.push("");

  out.push("HISTORY OF PRESENTING COMPLAINTS");
  for (const h of s.complaintHistory) out.push(h.text);
  out.push("");

  const section = (title: string, ls: SummaryLine[]) => {
    out.push(title);
    if (ls.length === 0) out.push("Not recorded.");
    else out.push(ls.map((l) => capitalise(l.text)).join(". ") + ".");
    out.push("");
  };
  section("PAST MEDICAL HISTORY", s.pastHistory);
  section("PERSONAL HISTORY", s.personalHistory);

  if (s.uncertain.length > 0) {
    out.push("PLEASE CONFIRM (voice answers the system was unsure about)");
    for (const u of s.uncertain) out.push(`? ${u.question} -> recorded "${u.recordedAs}"${u.heard ? `, heard "${u.heard}"` : ""}`);
    out.push("");
  }
  out.push(`Question bank ${s.bankVersion}. Generated by SETU from the patient's answers; review before use.`);
  return out.join("\n");
}
