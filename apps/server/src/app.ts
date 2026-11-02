/**
 * HTTP API. The engine does all interview logic; these routes only load a session, call one engine
 * function, save the new state and return it together with the next step.
 *
 *   GET  /api/health
 *   GET  /api/bank                                 the compiled question bank (the app caches it)
 *   POST /api/sessions                             { lang, patient }            -> session view
 *   GET  /api/sessions/:id                                                      -> session view
 *   POST /api/sessions/:id/complaints              { complaintIds }             -> session view
 *   POST /api/sessions/:id/answers                 { scope, questionId, answer } -> session view
 *   POST /api/sessions/:id/interpret               { scope, questionId, transcript } -> suggested answer (not saved)
 *   POST /api/sessions/:id/red-flags/:ruleId/ack   { by }                       -> session view
 *   POST /api/sessions/:id/confirm                                              -> session view
 *   GET  /api/sessions/:id/summary                 doctor summary (JSON + plain text)
 *   GET  /api/sessions                             recent sessions, for the doctor's list
 *   POST /api/transcribe?lang=bn                   raw audio body               -> { text }
 */
import cors from "@fastify/cors";
import type { Bank } from "@setu/bank";
import { Lang } from "@setu/bank";
import {
  acknowledgeRedFlag,
  answerQuestion,
  buildSummary,
  chooseComplaints,
  confirm,
  findQuestion,
  InvalidAnswerError,
  nextStep,
  renderSummaryText,
  startInterview,
  type InterviewState,
} from "@setu/engine";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { LlmGateway } from "./llm/gateway";
import { interpretAnswer } from "./llm/interpret";
import type { SpeechClient } from "./speech";
import type { Session, SessionStore } from "./store";

export interface AppDeps {
  bank: Bank;
  store: SessionStore;
  llm?: LlmGateway;
  speech?: SpeechClient;
  logger?: boolean;
}

const Patient = z.object({ ageYears: z.number().int().min(0).max(120).optional(), sex: z.enum(["male", "female", "other"]).optional() });
const AnswerBody = z.object({
  optionIds: z.array(z.string()).optional(),
  value: z.union([z.number(), z.string()]).optional(),
  details: z.record(z.string(), z.string()).optional(),
  skipped: z.enum(["dont_know", "refused"]).optional(),
  source: z.enum(["tap", "voice", "staff"]),
  transcript: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const { bank, store } = deps;
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 5 * 1024 * 1024 });
  app.register(cors, { origin: true });
  app.addContentTypeParser(/^audio\//, { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  app.setErrorHandler((error, _req, reply) => {
    const err = error as Error;
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message, details: err.details });
    if (err instanceof InvalidAnswerError) return reply.status(422).send({ error: "Invalid answer", details: err.problems });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid request", details: err.issues });
    if (/^Unknown (complaint|question)/.test(err.message)) return reply.status(400).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: err.message });
    app.log.error(err);
    return reply.status(500).send({ error: "Internal error" });
  });

  const view = (s: Session) => ({ id: s.id, state: s.state, step: nextStep(bank, s.state) });

  async function load(id: string): Promise<Session> {
    const s = await store.get(id);
    if (!s) throw new HttpError(404, "Session not found");
    if (s.state.bankVersion !== bank.version) {
      // Answers refer to question ids of the bank they were given against. A bank change mid-interview
      // is unusual (content is updated between clinic days); the interview can still continue.
      app.log.warn({ session: id, sessionBank: s.state.bankVersion, bank: bank.version }, "Session uses an older bank version");
    }
    return s;
  }

  async function apply(id: string, fn: (state: InterviewState) => InterviewState) {
    const s = await load(id);
    return view(await store.update(id, fn(s.state)));
  }

  app.get("/api/health", async () => ({ ok: true, bankVersion: bank.version, llm: !!deps.llm, speech: !!deps.speech }));
  app.get("/api/bank", async () => bank);

  app.post("/api/sessions", async (req, reply) => {
    const body = z.object({ lang: Lang, patient: Patient.default({}) }).parse(req.body);
    const s = await store.create(startInterview(bank, body.lang, body.patient));
    return reply.status(201).send(view(s));
  });

  app.get("/api/sessions", async () =>
    (await store.list(50)).map((s) => ({
      id: s.id,
      updatedAt: s.updatedAt,
      patient: s.state.patient,
      complaints: s.state.complaints,
      redFlags: s.state.redFlags.length,
      confirmed: s.state.confirmed,
    })),
  );

  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (req) => view(await load(req.params.id)));

  app.post<{ Params: { id: string } }>("/api/sessions/:id/complaints", async (req) => {
    const { complaintIds } = z.object({ complaintIds: z.array(z.string()).min(1) }).parse(req.body);
    return apply(req.params.id, (st) => chooseComplaints(bank, st, complaintIds));
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/answers", async (req) => {
    const body = z.object({ scope: z.string(), questionId: z.string(), answer: AnswerBody }).parse(req.body);
    return apply(req.params.id, (st) => answerQuestion(bank, st, body.scope, body.questionId, body.answer));
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/interpret", async (req) => {
    const body = z.object({ scope: z.string(), questionId: z.string(), transcript: z.string().min(1) }).parse(req.body);
    const s = await load(req.params.id);
    const question = findQuestion(bank, body.scope, body.questionId);
    return interpretAnswer(question, body.transcript, s.state.lang, deps.llm);
  });

  app.post<{ Params: { id: string; ruleId: string } }>("/api/sessions/:id/red-flags/:ruleId/ack", async (req) => {
    const { by } = z.object({ by: z.string().min(1) }).parse(req.body);
    return apply(req.params.id, (st) => {
      if (!st.redFlags.some((f) => f.ruleId === req.params.ruleId)) throw new HttpError(404, "Red flag not raised in this session");
      return acknowledgeRedFlag(st, req.params.ruleId, by);
    });
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/confirm", async (req) =>
    apply(req.params.id, (st) => {
      try {
        return confirm(bank, st);
      } catch (e) {
        throw new HttpError(409, (e as Error).message);
      }
    }),
  );

  app.get<{ Params: { id: string } }>("/api/sessions/:id/summary", async (req) => {
    const s = await load(req.params.id);
    const summary = buildSummary(bank, s.state);
    return { summary, text: renderSummaryText(summary) };
  });

  app.post<{ Querystring: { lang?: string } }>("/api/transcribe", async (req) => {
    if (!deps.speech) throw new HttpError(503, "Voice input is not available on this server");
    const lang = Lang.parse(req.query.lang ?? "en");
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, "Send the recording as an audio/* body");
    return deps.speech.transcribe(req.body, req.headers["content-type"] ?? "audio/webm", lang);
  });

  return app;
}
