/**
 * Compiles the real content folder. If a clinician edit breaks the bank, this fails in CI
 * before anything reaches a patient.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileBank } from "../src/compile";

const contentDir = resolve(__dirname, "../../../content");

describe("compileBank on the real content", async () => {
  const { bank, diagnostics } = await compileBank(contentDir, new Date("2026-01-01T00:00:00Z"));

  it("builds without errors", () => {
    expect(diagnostics.errors).toEqual([]);
    expect(bank).toBeDefined();
  });

  it("finds every complaint in the sheet", () => {
    expect(bank!.complaints.length).toBe(35);
    expect(bank!.complaints.map((c) => c.id)).toContain("chest-pain");
  });

  it("does not repeat merged complaint names on every row", () => {
    const headache = bank!.complaints.find((c) => c.id === "headache")!;
    expect(headache.questions.map((q) => q.id)).toEqual(
      expect.arrayContaining(["duration", "where-did-it-start", "intensity", "any-associated-symptoms"]),
    );
  });

  it("resolves ~links, including the corrected ~Vomitting", () => {
    const swelling = bank!.complaints.find((c) => c.id === "abdomen-swelling")!;
    const vomiting = swelling.questions.find((q) => q.id === "vomiting")!;
    expect(vomiting.options.find((o) => o.id === "yes")?.triggersComplaint).toBe("vomiting");
  });

  it("reads duration questions", () => {
    const chest = bank!.complaints.find((c) => c.id === "chest-pain")!;
    expect(chest.questions.find((q) => q.id === "duration")).toMatchObject({ kind: "duration", noteTemplate: "_ days" });
  });

  it("marks associated-symptom questions as multi-select with an exclusive None", () => {
    const chest = bank!.complaints.find((c) => c.id === "chest-pain")!;
    const assoc = chest.questions.find((q) => q.id === "any-associated-symptoms")!;
    expect(assoc.kind).toBe("multi");
  });

  it("keeps every red-flag rule pointing at real ids", () => {
    expect(diagnostics.errors.filter((d) => d.where.startsWith("red-flags"))).toEqual([]);
    expect(bank!.redFlags.length).toBeGreaterThan(0);
  });
});
