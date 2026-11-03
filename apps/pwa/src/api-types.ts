/** Shapes shared by the server API client and the in-browser demo. */
import type { Answer, InterviewState, Patient, Step } from "@setu/engine";

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

