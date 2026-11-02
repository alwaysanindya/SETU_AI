import { describe, expect, it } from "vitest";
import { parseOptionToken, parseValueToken, splitAnswers } from "../src/answers";

describe("splitAnswers", () => {
  it("splits on semicolons", () => {
    expect(splitAnswers("Mild;Moderate;Severe").parts).toEqual(["Mild", "Moderate", "Severe"]);
  });
  it("ignores separators inside brackets", () => {
    expect(splitAnswers("Yes [describe nature of pain: Throbbing;Dull];No").parts).toEqual([
      "Yes [describe nature of pain: Throbbing;Dull]",
      "No",
    ]);
  });
  it("accepts Yes/No and Yes: No but reports the separator", () => {
    expect(splitAnswers("Yes/No")).toMatchObject({ parts: ["Yes", "No"], unusualSeparator: "/" });
    expect(splitAnswers("Yes: No")).toMatchObject({ parts: ["Yes", "No"], unusualSeparator: ":" });
  });
  it("does not split abbreviations or phrases", () => {
    expect(splitAnswers("H/O Injury").parts).toEqual(["H/O Injury"]);
    expect(splitAnswers("Increase on coughing/straining").parts).toEqual(["Increase on coughing/straining"]);
    expect(splitAnswers("If yes, Write location []").parts).toEqual(["If yes, Write location []"]);
  });
  it("drops empty parts from a trailing semicolon", () => {
    expect(splitAnswers("Exertion;")).toMatchObject({ parts: ["Exertion"], droppedEmpty: true });
  });
});

describe("parseValueToken", () => {
  it.each([
    ["_days", "duration"],
    ["_freq", "number"],
    ["[number]", "number"],
    ["[enter # of children]", "number"],
    ["[date] *either calendar or dd/mm/yyyy", "date"],
    ["[describe]", "text"],
    ["Decription Box", "text"],
    ["[] days/months/years", "duration"],
  ])("%s -> %s", (token, kind) => {
    expect(parseValueToken(token, "Question")?.kind).toBe(kind);
  });
  it("uses the question to decide what an empty [] means", () => {
    expect(parseValueToken("[]", "No. of times/day")?.kind).toBe("number");
    expect(parseValueToken("[]", "Where?")?.kind).toBe("text");
  });
  it("returns undefined for ordinary answers", () => {
    expect(parseValueToken("Mild", "Intensity")).toBeUndefined();
  });
});

describe("parseOptionToken", () => {
  it("reads free-text and number details", () => {
    expect(parseOptionToken("Others[describe]")).toEqual({ label: "Others", detail: { kind: "text", prompt: "describe" } });
    expect(parseOptionToken("Climbing Stairs [enter # of stairs]")).toEqual({
      label: "Climbing Stairs",
      detail: { kind: "number", prompt: "enter # of stairs" },
    });
    expect(parseOptionToken("[describe]").label).toBe("Other");
  });
  it("separates staff instructions from the answer", () => {
    expect(parseOptionToken("Yes (Send patient immediately to nearest hospital after bandaging the part!)")).toEqual({
      label: "Yes",
      staffInstruction: "Send patient immediately to nearest hospital after bandaging the part!",
    });
    expect(parseOptionToken("Upper(R)")).toEqual({ label: "Upper(R)" });
  });
});
