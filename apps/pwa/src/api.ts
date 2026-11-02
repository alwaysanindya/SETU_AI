/** Calls to the clinic server (apps/server). One function per route; see apps/server/src/app.ts. */
import type { Bank, Lang } from "@setu/bank";
import type { Answer, DoctorSummary, InterviewState, Patient, Step } from "@setu/engine";

export interface SessionView {
  id: string;
  state: InterviewState;
  step: Step;
}

export interface Interpretation {
  answer?: Answer;
  method: "dont_know" | "number" | "synonym" | "llm" | "none";
}

export interface SessionListItem {
  id: string;
  updatedAt: string;
  patient: Patient;
  complaints: string[];
  redFlags: number;
  confirmed: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText, json.details);
  return json as T;
}

export const api = {
  bank: () => call<Bank>("GET", "/api/bank"),
  start: (lang: Lang, patient: Patient) => call<SessionView>("POST", "/api/sessions", { lang, patient }),
  get: (id: string) => call<SessionView>("GET", `/api/sessions/${id}`),
  list: () => call<SessionListItem[]>("GET", "/api/sessions"),
  chooseComplaints: (id: string, complaintIds: string[]) => call<SessionView>("POST", `/api/sessions/${id}/complaints`, { complaintIds }),
  answer: (id: string, scope: string, questionId: string, answer: Answer) =>
    call<SessionView>("POST", `/api/sessions/${id}/answers`, { scope, questionId, answer }),
  interpret: (id: string, scope: string, questionId: string, transcript: string) =>
    call<Interpretation>("POST", `/api/sessions/${id}/interpret`, { scope, questionId, transcript }),
  acknowledge: (id: string, ruleId: string, by: string) => call<SessionView>("POST", `/api/sessions/${id}/red-flags/${ruleId}/ack`, { by }),
  confirm: (id: string) => call<SessionView>("POST", `/api/sessions/${id}/confirm`),
  summary: (id: string) => call<{ summary: DoctorSummary; text: string }>("GET", `/api/sessions/${id}/summary`),
  async transcribe(audio: Blob, lang: Lang): Promise<{ text: string }> {
    const res = await fetch(`/api/transcribe?lang=${lang}`, { method: "POST", headers: { "content-type": audio.type || "audio/webm" }, body: audio });
    if (!res.ok) throw new ApiError(res.status, "Could not hear the answer");
    return res.json();
  },
};
