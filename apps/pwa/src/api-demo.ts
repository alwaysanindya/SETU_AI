/**
 * Demo mode: the interview engine and question bank run inside the browser, with sessions kept in
 * memory on this device. Same functions as the server API, so the screens do not know the difference.
 * Voice answers need the speech service, so in the demo patients tap their answers.
 * Never used for real patients.
 */
import { Bank } from "@setu/bank";
import {
  acknowledgeRedFlag,
  answerQuestion,
  buildSummary,
  chooseComplaints,
  confirm,
  nextStep,
  renderSummaryText,
  startInterview,
  type InterviewState,
} from "@setu/engine";
import bankJson from "../../../content/bank/bank.json";
import type { Api } from "./api";
import { ApiError, type SessionView } from "./api-types";

const bank = Bank.parse(bankJson);
const sessions = new Map<string, { state: InterviewState; updatedAt: string }>();

function view(id: string): SessionView {
  const s = sessions.get(id);
  if (!s) throw new ApiError(404, "Session not found");
  return { id, state: s.state, step: nextStep(bank, s.state) };
}

function apply(id: string, fn: (s: InterviewState) => InterviewState): SessionView {
  const s = sessions.get(id);
  if (!s) throw new ApiError(404, "Session not found");
  try {
    sessions.set(id, { state: fn(s.state), updatedAt: new Date().toISOString() });
  } catch (e) {
    throw new ApiError(422, (e as Error).message);
  }
  return view(id);
}

export const demoApi: Api = {
  bank: async () => bank,
  start: async (lang, patient) => {
    const id = crypto.randomUUID();
    sessions.set(id, { state: startInterview(bank, lang, patient), updatedAt: new Date().toISOString() });
    return view(id);
  },
  get: async (id) => view(id),
  list: async () =>
    [...sessions.entries()]
      .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
      .map(([id, s]) => ({
        id,
        updatedAt: s.updatedAt,
        patient: s.state.patient,
        complaints: s.state.complaints,
        redFlags: s.state.redFlags.length,
        confirmed: s.state.confirmed,
      })),
  chooseComplaints: async (id, complaintIds) => apply(id, (s) => chooseComplaints(bank, s, complaintIds)),
  answer: async (id, scope, questionId, answer) => apply(id, (s) => answerQuestion(bank, s, scope, questionId, answer)),
  interpret: async () => ({ method: "none" }),
  acknowledge: async (id, ruleId, by) => apply(id, (s) => acknowledgeRedFlag(s, ruleId, by)),
  confirm: async (id) => apply(id, (s) => confirm(bank, s)),
  summary: async (id) => {
    const s = sessions.get(id);
    if (!s) throw new ApiError(404, "Session not found");
    const summary = buildSummary(bank, s.state);
    return { summary, text: renderSummaryText(summary) };
  },
  transcribe: async () => {
    throw new ApiError(503, "Voice answers are not available in the demo");
  },
};
