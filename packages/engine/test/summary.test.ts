import { describe, expect, it } from "vitest";
import { acknowledgeRedFlag, answerQuestion, chooseComplaints, startInterview } from "../src/flow";
import { humanizeLabel, optionFragment } from "../src/note";
import { PAST_HISTORY } from "../src/state";
import { buildSummary, renderSummaryText } from "../src/summary";
import { bank, tap, value } from "./helpers";

describe("labels and templates", () => {
  it("reads side markers naturally", () => {
    expect(humanizeLabel("Upper(R)")).toBe("upper right");
    expect(humanizeLabel("Arm(L)")).toBe("left arm");
    expect(humanizeLabel("Difficulty in Breathing")).toBe("difficulty in breathing");
    expect(humanizeLabel("H/O Injury")).toBe("H/O injury");
  });

  it("turns Yes/No templates into + and -", () => {
    const opt = (id: string, noteTemplate: string) => ({ id, label: { en: id }, noteTemplate, exclusive: false });
    expect(optionFragment(opt("yes", "Fever_/_"), undefined)).toBe("Fever +");
    expect(optionFragment(opt("no", "Fever_/_"), undefined)).toBe("Fever -");
    expect(optionFragment(opt("yes", "_ H/O alcohol"), undefined)).toBe("H/O alcohol +");
    expect(optionFragment(opt("no", "No fit/Fit yes (witnessed/unwitnessed)"), undefined)).toBe("No fit");
    expect(optionFragment(opt("yes", "No fit/Fit yes (witnessed/unwitnessed)"), undefined)).toBe("Fit yes (witnessed/unwitnessed)");
  });

  it("fills several blanks from one detail", () => {
    const o = { id: "single", label: { en: "Single" }, noteTemplate: "_ x _ in size", exclusive: false };
    expect(optionFragment(o, "4 x 3")).toBe("4 x 3 in size");
    expect(optionFragment(o, "4")).toBe("4 x ? in size");
  });
});

describe("chest pain golden case", () => {
  let s = startInterview(bank, "en", { ageYears: 58, sex: "male" });
  s = chooseComplaints(bank, s, ["chest-pain"]);
  s = answerQuestion(bank, s, "chest-pain", "duration", value(1));
  s = answerQuestion(bank, s, "chest-pain", "where-did-it-start", tap("upper-c"));
  s = answerQuestion(bank, s, "chest-pain", "where-is-it-now", tap("arm-l"));
  s = answerQuestion(bank, s, "chest-pain", "how-did-the-pain-start", tap("sudden"));
  s = answerQuestion(bank, s, "chest-pain", "intensity", tap("severe"));
  s = answerQuestion(bank, s, "chest-pain", "nature", tap("sense-of-pressure"));
  s = answerQuestion(bank, s, "chest-pain", "what-brings-it-on", tap("exertion"));
  s = answerQuestion(bank, s, "chest-pain", "relieved-by", tap("rest"));
  s = answerQuestion(bank, s, "chest-pain", "any-associated-symptoms", {
    optionIds: ["sweating", "extreme-anxiety"],
    source: "voice",
    transcript: "ghaam hocche, khub bhoy lagche",
    confidence: "medium",
  });
  s = answerQuestion(bank, s, PAST_HISTORY, "known-conditions", tap("diabetes", "hypertension"));
  s = answerQuestion(bank, s, PAST_HISTORY, "allergies", { ...tap("yes"), details: { yes: "sulfa drugs" } });
  for (const f of s.redFlags) s = acknowledgeRedFlag(s, f.ruleId, "Nurse Rina");
  const summary = buildSummary(bank, s);

  it("writes the complaint history as one sentence", () => {
    expect(summary.complaintHistory[0]!.text).toBe(
      "Chest Pain: 1 day, started upper centre, now felt left arm, sudden onset, severe in intensity, " +
        "sense of pressure in nature, brought on by exertion, relieved by rest, associated with sweating and extreme anxiety.",
    );
  });

  it("codes the complaint as patient-reported with a draft WHO ICD-10 code", () => {
    expect(summary.codedComplaints[0]).toMatchObject({ complaintId: "chest-pain", basis: "patient-reported" });
    expect(summary.codedComplaints[0]!.codes?.icd10Who?.code).toBe("R07.4");
    expect(summary.codedComplaints[0]!.codes?.verified).toBe(false);
  });

  it("lists red flags with who saw them", () => {
    const ids = summary.redFlags.map((f) => f.ruleId);
    expect(ids).toEqual(expect.arrayContaining(["chest-pain-spreading", "chest-pain-on-exertion", "chest-pain-with-sweating-breathlessness-or-collapse"]));
    expect(summary.redFlags.every((f) => f.acknowledgedBy === "Nurse Rina")).toBe(true);
  });

  it("merges past-history choices and uses details", () => {
    expect(summary.pastHistory.map((l) => l.text)).toEqual(["Known diabetes (sugar) and high blood pressure", "Allergy: sulfa drugs"]);
  });

  it("flags uncertain voice answers for the doctor", () => {
    expect(summary.uncertain).toHaveLength(1);
    expect(summary.uncertain[0]).toMatchObject({ questionId: "any-associated-symptoms", heard: "ghaam hocche, khub bhoy lagche" });
  });

  it("renders plain text with red flags first and the not-a-diagnosis label", () => {
    const text = renderSummaryText(summary);
    expect(text.indexOf("RED FLAGS")).toBeLessThan(text.indexOf("PRESENTING COMPLAINTS"));
    expect(text).toContain("patient-reported, not a diagnosis");
    expect(text).toContain("R07.4");
    expect(text).toContain("NOT YET CONFIRMED BY PATIENT");
  });
});
