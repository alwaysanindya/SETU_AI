import { describe, expect, it } from "vitest";
import {
  acknowledgeRedFlag,
  answerQuestion,
  chooseComplaints,
  confirm,
  InvalidAnswerError,
  nextStep,
  startInterview,
  validateAnswer,
} from "../src/flow";
import { PAST_HISTORY, PERSONAL_HISTORY } from "../src/state";
import { bank, questionStep, tap, value } from "./helpers";

const start = () => startInterview(bank, "en", { ageYears: 52, sex: "male" });

describe("interview order", () => {
  it("asks for a complaint first, then that complaint's questions in sheet order", () => {
    let s = start();
    expect(nextStep(bank, s).type).toBe("choose_complaint");
    s = chooseComplaints(bank, s, ["headache"]);
    const step = questionStep(nextStep(bank, s));
    expect(step.scope).toBe("headache");
    expect(step.question.id).toBe("duration");
    s = answerQuestion(bank, s, "headache", "duration", value(3));
    expect(questionStep(nextStep(bank, s)).question.id).toBe("where-did-it-start");
  });

  it("moves to past history, then personal history, then review and done", () => {
    let s = chooseComplaints(bank, start(), ["headache"]);
    for (const q of bank.complaints.find((c) => c.id === "headache")!.questions) {
      s = answerQuestion(bank, s, "headache", q.id, q.kind === "duration" ? value(2) : { skipped: "dont_know", source: "tap" });
    }
    expect(questionStep(nextStep(bank, s)).scope).toBe(PAST_HISTORY);
    for (const q of bank.pastHistory.questions) s = answerQuestion(bank, s, PAST_HISTORY, q.id, { skipped: "refused", source: "tap" });
    expect(questionStep(nextStep(bank, s)).scope).toBe(PERSONAL_HISTORY);
    for (const q of bank.personalHistory.questions) s = answerQuestion(bank, s, PERSONAL_HISTORY, q.id, { skipped: "dont_know", source: "tap" });
    expect(nextStep(bank, s).type).toBe("review");
    s = confirm(bank, s);
    expect(nextStep(bank, s).type).toBe("done");
  });

  it("skips female-only questions for a male patient", () => {
    const asked = bank.personalHistory.questions.filter((q) => q.appliesTo?.sex === "female");
    expect(asked.length).toBeGreaterThan(0);
    let s = chooseComplaints(bank, start(), ["headache"]);
    for (const c of s.complaints)
      for (const q of bank.complaints.find((x) => x.id === c)!.questions) s = answerQuestion(bank, s, c, q.id, { skipped: "dont_know", source: "tap" });
    for (const q of bank.pastHistory.questions) s = answerQuestion(bank, s, PAST_HISTORY, q.id, { skipped: "dont_know", source: "tap" });
    const seen: string[] = [];
    for (let step = nextStep(bank, s); step.type === "question"; step = nextStep(bank, s)) {
      seen.push(step.question.id);
      s = answerQuestion(bank, s, step.scope, step.question.id, { skipped: "dont_know", source: "tap" });
    }
    for (const q of asked) expect(seen).not.toContain(q.id);
  });

  it("does not let confirm skip unanswered questions", () => {
    const s = chooseComplaints(bank, start(), ["headache"]);
    expect(() => confirm(bank, s)).toThrow();
  });
});

describe("linked complaints", () => {
  it("adds an urgent linked complaint to the front of the queue", () => {
    let s = chooseComplaints(bank, start(), ["general-weakness", "headache"]);
    s = answerQuestion(bank, s, "general-weakness", "chest-pain", tap("yes"));
    expect(s.complaints).toEqual(["chest-pain", "general-weakness", "headache"]);
    expect(questionStep(nextStep(bank, s)).scope).toBe("chest-pain");
  });

  it("adds a non-urgent linked complaint to the end", () => {
    let s = chooseComplaints(bank, start(), ["general-weakness", "headache"]);
    s = answerQuestion(bank, s, "general-weakness", "abdominal-pain", tap("yes"));
    expect(s.complaints).toEqual(["general-weakness", "headache", "abdominal-pain"]);
  });

  it("does not add a complaint twice", () => {
    let s = chooseComplaints(bank, start(), ["chest-pain", "general-weakness"]);
    s = answerQuestion(bank, s, "general-weakness", "chest-pain", tap("yes"));
    expect(s.complaints).toEqual(["chest-pain", "general-weakness"]);
  });
});

describe("red flags", () => {
  it("pauses the interview until staff acknowledge", () => {
    let s = chooseComplaints(bank, start(), ["chest-pain"]);
    s = answerQuestion(bank, s, "chest-pain", "where-is-it-now", tap("arm-l"));
    const step = nextStep(bank, s);
    expect(step.type).toBe("red_flag");
    if (step.type === "red_flag") expect(step.rules.map((r) => r.id)).toContain("chest-pain-spreading");

    s = acknowledgeRedFlag(s, "chest-pain-spreading", "Nurse Rina");
    expect(nextStep(bank, s).type).toBe("question");
    expect(s.redFlags[0]).toMatchObject({ acknowledged: true, acknowledgedBy: "Nurse Rina" });
  });

  it("fires each rule once, even if the answer is changed and changed back", () => {
    let s = chooseComplaints(bank, start(), ["chest-pain"]);
    s = answerQuestion(bank, s, "chest-pain", "where-is-it-now", tap("arm-l"));
    s = acknowledgeRedFlag(s, "chest-pain-spreading", "staff");
    s = answerQuestion(bank, s, "chest-pain", "where-is-it-now", tap("neck-jaw"));
    expect(s.redFlags.filter((f) => f.ruleId === "chest-pain-spreading")).toHaveLength(1);
    expect(nextStep(bank, s).type).toBe("question");
  });
});

describe("validation", () => {
  const assoc = bank.complaints.find((c) => c.id === "chest-pain")!.questions.find((q) => q.id === "any-associated-symptoms")!;

  it("rejects 'None' combined with other answers", () => {
    expect(validateAnswer(assoc, tap("none", "sweating"))).not.toEqual([]);
    expect(validateAnswer(assoc, tap("none"))).toEqual([]);
  });

  it("rejects unknown options and empty choices", () => {
    expect(validateAnswer(assoc, tap("nonsense"))).not.toEqual([]);
    expect(validateAnswer(assoc, tap())).not.toEqual([]);
  });

  it("accepts a skipped answer for any question", () => {
    expect(validateAnswer(assoc, { skipped: "dont_know", source: "voice" })).toEqual([]);
  });

  it("throws InvalidAnswerError and leaves the state unchanged", () => {
    const s = chooseComplaints(bank, start(), ["chest-pain"]);
    expect(() => answerQuestion(bank, s, "chest-pain", "duration", value(-1))).toThrow(InvalidAnswerError);
    expect(s.answers).toEqual({});
  });
});
