/**
 * Where interview sessions are kept. The in-memory store is for development and the first pilot;
 * a Postgres store with the same interface replaces it before real patient data is stored.
 */
import { randomUUID } from "node:crypto";
import type { InterviewState } from "@setu/engine";

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: InterviewState;
}

export interface SessionStore {
  create(state: InterviewState): Promise<Session>;
  get(id: string): Promise<Session | undefined>;
  update(id: string, state: InterviewState): Promise<Session>;
  list(limit: number): Promise<Session[]>;
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>();

  async create(state: InterviewState): Promise<Session> {
    const now = new Date().toISOString();
    const s: Session = { id: randomUUID(), createdAt: now, updatedAt: now, state };
    this.sessions.set(s.id, s);
    return s;
  }

  async get(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async update(id: string, state: InterviewState): Promise<Session> {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Unknown session ${id}`);
    const next = { ...s, state, updatedAt: new Date().toISOString() };
    this.sessions.set(id, next);
    return next;
  }

  async list(limit: number): Promise<Session[]> {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }
}
