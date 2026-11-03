import { describe, expect, it } from "vitest";
import { matchAnswer } from "../src/answer-match";
import { bank } from "./helpers";

const q = (complaint: string, id: string) => bank.complaints.find((c) => c.id === complaint)!.questions.find((x) => x.id === id)!;

describe("matchAnswer", () => {
  it("reads durations in English, Hindi and Bengali", () => {
    expect(matchAnswer(q("headache", "duration"), "three days", "en").answer?.value).toBe(3);
    expect(matchAnswer(q("headache", "duration"), "दो हफ्ते से", "hi").answer?.value).toBe(14);
    expect(matchAnswer(q("headache", "duration"), "২ মাস", "bn").answer?.value).toBe(60);
  });

  it("matches option words and synonyms", () => {
    expect(matchAnswer(q("headache", "intensity"), "it is severe", "en").answer?.optionIds).toEqual(["severe"]);
    expect(matchAnswer(q("headache", "how-did-the-pain-start"), "হঠাৎ শুরু হল", "bn").answer?.optionIds).toEqual(["sudden"]);
  });

  it("recognises 'I don't know' and gives up on nonsense", () => {
    expect(matchAnswer(q("headache", "intensity"), "জানি না", "bn").answer?.skipped).toBe("dont_know");
    expect(matchAnswer(q("headache", "intensity"), "the weather is nice", "en").method).toBe("none");
  });

  it("marks every suggestion as a voice answer with the transcript", () => {
    expect(matchAnswer(q("headache", "intensity"), "mild", "en").answer).toMatchObject({ source: "voice", transcript: "mild" });
  });
});
