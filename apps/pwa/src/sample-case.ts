/** A ready-made interview for the demo's doctor view, so the summary can be seen without answering everything. */
import { api } from "./api";

export async function loadSampleCase(): Promise<string> {
  let s = await api.start("bn", { ageYears: 58, sex: "male" });
  const id = s.id;
  s = await api.chooseComplaints(id, ["chest-pain", "difficulty-in-breathing"]);
  const answers: [string, string, Parameters<typeof api.answer>[3]][] = [
    ["chest-pain", "duration", { value: 2, source: "tap" }],
    ["chest-pain", "where-did-it-start", { optionIds: ["upper-c"], source: "tap" }],
    ["chest-pain", "where-is-it-now", { optionIds: ["arm-l"], source: "voice", transcript: "বাম হাতে যাচ্ছে", confidence: "high" }],
    ["chest-pain", "how-did-the-pain-start", { optionIds: ["sudden"], source: "tap" }],
    ["chest-pain", "intensity", { optionIds: ["severe"], source: "tap" }],
    ["chest-pain", "nature", { optionIds: ["sense-of-pressure"], source: "voice", transcript: "চাপ চাপ লাগছে", confidence: "medium" }],
    ["chest-pain", "what-brings-it-on", { optionIds: ["exertion"], source: "tap" }],
    ["chest-pain", "relieved-by", { optionIds: ["rest"], source: "tap" }],
    ["chest-pain", "any-associated-symptoms", { optionIds: ["sweating", "difficulty-in-breathing"], source: "tap" }],
    ["past-history", "known-conditions", { optionIds: ["diabetes", "hypertension"], source: "tap" }],
    ["past-history", "daily-medicines", { optionIds: ["yes"], details: { yes: "Metformin, Amlodipine" }, source: "staff" }],
    ["past-history", "allergies", { optionIds: ["no"], source: "tap" }],
    ["past-history", "family-history", { optionIds: ["heart-disease"], source: "tap" }],
  ];
  for (const [scope, q, a] of answers) s = await api.answer(id, scope, q, a);
  for (const f of s.state.redFlags) s = await api.acknowledge(id, f.ruleId, "Nurse (sample)");
  return id;
}
