import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Bank } from "@setu/bank";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import type { LlmGateway } from "../src/llm/gateway";
import { InMemorySessionStore } from "../src/store";

const bank = Bank.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../../content/bank/bank.json", import.meta.url)), "utf8")));

function setup(llm?: LlmGateway) {
  return buildApp({ bank, store: new InMemorySessionStore(), llm });
}

describe("session API", () => {
  it("runs an interview through red flag, acknowledge and summary", async () => {
    const app = setup();
    const created = await app.inject({ method: "POST", url: "/api/sessions", payload: { lang: "bn", patient: { ageYears: 60, sex: "male" } } });
    expect(created.statusCode).toBe(201);
    const { id, step } = created.json();
    expect(step.type).toBe("choose_complaint");

    let r = await app.inject({ method: "POST", url: `/api/sessions/${id}/complaints`, payload: { complaintIds: ["chest-pain"] } });
    expect(r.json().step.question.id).toBe("duration");

    r = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/answers`,
      payload: { scope: "chest-pain", questionId: "where-is-it-now", answer: { optionIds: ["arm-l"], source: "tap" } },
    });
    expect(r.json().step.type).toBe("red_flag");

    r = await app.inject({ method: "POST", url: `/api/sessions/${id}/red-flags/chest-pain-spreading/ack`, payload: { by: "Nurse" } });
    expect(r.json().step.type).toBe("question");

    r = await app.inject({ method: "GET", url: `/api/sessions/${id}/summary` });
    expect(r.json().text).toContain("Chest pain spreading to left arm");
  });

  it("rejects an invalid answer with 422 and the reasons", async () => {
    const app = setup();
    const { id } = (await app.inject({ method: "POST", url: "/api/sessions", payload: { lang: "en" } })).json();
    await app.inject({ method: "POST", url: `/api/sessions/${id}/complaints`, payload: { complaintIds: ["headache"] } });
    const r = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/answers`,
      payload: { scope: "headache", questionId: "intensity", answer: { optionIds: ["mild", "severe"], source: "tap" } },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().details).toContain("Choose exactly one answer.");
  });

  it("returns 404 for an unknown session and 400 for an unknown complaint", async () => {
    const app = setup();
    expect((await app.inject({ method: "GET", url: "/api/sessions/nope" })).statusCode).toBe(404);
    const { id } = (await app.inject({ method: "POST", url: "/api/sessions", payload: { lang: "en" } })).json();
    expect((await app.inject({ method: "POST", url: `/api/sessions/${id}/complaints`, payload: { complaintIds: ["zzz"] } })).statusCode).toBe(400);
  });

  it("refuses to confirm before all questions are answered", async () => {
    const app = setup();
    const { id } = (await app.inject({ method: "POST", url: "/api/sessions", payload: { lang: "en" } })).json();
    expect((await app.inject({ method: "POST", url: `/api/sessions/${id}/confirm` })).statusCode).toBe(409);
  });
});

describe("voice answer interpretation", () => {
  async function interpret(transcript: string, questionId: string, lang = "hi", llm?: LlmGateway) {
    const app = setup(llm);
    const { id } = (await app.inject({ method: "POST", url: "/api/sessions", payload: { lang } })).json();
    await app.inject({ method: "POST", url: `/api/sessions/${id}/complaints`, payload: { complaintIds: ["headache"] } });
    return (await app.inject({ method: "POST", url: `/api/sessions/${id}/interpret`, payload: { scope: "headache", questionId, transcript } })).json();
  }

  it("reads durations in Hindi and Bengali without the LLM", async () => {
    expect((await interpret("तीन दिन से", "duration")).answer.value).toBe(3);
    expect((await interpret("দুই সপ্তাহ", "duration", "bn")).answer.value).toBe(14);
    expect((await interpret("teen mahine", "duration")).answer.value).toBe(90);
  });

  it("matches option words and 'don't know'", async () => {
    expect((await interpret("अचानक शुरू हुआ", "how-did-the-pain-start")).answer.optionIds).toEqual(["sudden"]);
    expect((await interpret("pata nahi", "intensity")).answer.skipped).toBe("dont_know");
  });

  it("asks the LLM only when matching fails, and drops answers outside the options", async () => {
    let calls = 0;
    const llm: LlmGateway = {
      async interpret() {
        calls++;
        return { optionIds: ["moderate"], dontKnow: false, confidence: "medium" };
      },
    };
    const r = await interpret("bas theek-thaak hai, sehne layak", "intensity", "hi", llm);
    expect(calls).toBe(1);
    expect(r).toMatchObject({ method: "llm", answer: { optionIds: ["moderate"], confidence: "medium", source: "voice" } });
  });

  it("falls back to buttons when the LLM is down", async () => {
    const llm: LlmGateway = { async interpret() { throw new Error("connection refused"); } };
    expect((await interpret("hmm", "intensity", "hi", llm)).method).toBe("none");
  });
});
