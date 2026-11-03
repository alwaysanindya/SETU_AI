/**
 * Fast, deterministic matching of spoken answers before the LLM is asked.
 * Most answers are short ("haan", "teen din", "severe"), and matching them here is instant,
 * free, and predictable. Only answers this cannot place go to the LLM.
 *
 * Bengali and Hindi words are given in both native script and the romanised forms speech
 * recognition sometimes produces. These lists need native-speaker review and will grow from
 * pilot transcripts.
 */
import type { Lang, Option, Question } from "@setu/bank";
import type { Answer } from "./state";

/** Words for common option ids, by language. Option labels (and their translations) are always matched too. */
export const OPTION_WORDS: Record<string, Partial<Record<Lang, string[]>>> = {
  yes: { en: ["yes", "yeah", "yup", "right", "correct"], hi: ["हाँ", "हां", "हा", "जी", "haan", "han", "ji"], bn: ["হ্যাঁ", "হাঁ", "হুঁ", "haan", "hya", "hyan"] },
  no: { en: ["no", "nope", "not"], hi: ["नहीं", "ना", "nahi", "nahin", "na"], bn: ["না", "নাহ", "na", "nah"] },
  none: { en: ["none", "nothing", "no"], hi: ["कुछ नहीं", "कोई नहीं", "नहीं", "kuch nahi"], bn: ["কিছু না", "কিছুই না", "না", "kichu na"] },
  mild: { en: ["mild", "little", "slight", "a bit"], hi: ["हल्का", "थोड़ा", "halka", "thoda"], bn: ["অল্প", "হালকা", "olpo", "halka"] },
  moderate: { en: ["moderate", "medium"], hi: ["मध्यम", "बीच का", "madhyam"], bn: ["মাঝারি", "majhari"] },
  severe: { en: ["severe", "very bad", "a lot", "terrible", "unbearable"], hi: ["बहुत", "तेज़", "तेज", "bahut", "tez"], bn: ["খুব", "প্রচণ্ড", "ভীষণ", "khub", "prochondo"] },
  sudden: { en: ["sudden", "suddenly", "all at once"], hi: ["अचानक", "achanak"], bn: ["হঠাৎ", "hothat"] },
  gradual: { en: ["gradual", "gradually", "slowly"], hi: ["धीरे", "धीरे-धीरे", "dhire"], bn: ["ধীরে", "আস্তে", "dhire", "aste"] },
};

/** Phrases meaning "I don't know". */
export const DONT_KNOW: Record<Lang, string[]> = {
  en: ["don't know", "dont know", "not sure", "no idea"],
  hi: ["पता नहीं", "मालूम नहीं", "pata nahi", "malum nahi"],
  bn: ["জানি না", "জানিনা", "jani na"],
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, पंद्रह: 15, बीस: 20,
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5, saat: 7, das: 10,
  "এক": 1, "দুই": 2, "দু": 2, "তিন": 3, "চার": 4, "পাঁচ": 5, "ছয়": 6, "সাত": 7, "আট": 8, "নয়": 9, "দশ": 10, "পনেরো": 15, "কুড়ি": 20,
  dui: 2, tin: 3, pach: 5, dosh: 10,
};

/** Days per unit word. */
const UNIT_DAYS: [RegExp, number][] = [
  [/(day|days|din|दिन|দিন)/, 1],
  [/(week|weeks|hafta|hafte|हफ्ते|हफ़्ते|सप्ताह|সপ্তাহ|shoptaho)/, 7],
  [/(month|months|mahina|mahine|महीने|महीना|মাস|mash|mas)/, 30],
  [/(year|years|saal|sal|साल|বছর|bochor)/, 365],
];

const NATIVE_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[०-९০-৯]/g, (d) => NATIVE_DIGITS[d] ?? d)
    .replace(/[.,!?;:"'।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string): boolean {
  const p = normalise(phrase);
  if (!p) return false;
  // Word boundaries that also work for Bengali and Devanagari: pad with spaces.
  return ` ${text} `.includes(` ${p} `);
}

export function isDontKnow(text: string, lang: Lang): boolean {
  const t = normalise(text);
  return [...DONT_KNOW[lang], ...DONT_KNOW.en].some((p) => containsPhrase(t, p));
}

/** Reads "3", "teen", "তিন" etc. Returns undefined when there is no number or more than one. */
export function parseNumber(text: string): number | undefined {
  const t = normalise(text);
  const found: number[] = [];
  for (const m of t.matchAll(/\d+(\.\d+)?/g)) found.push(Number(m[0]));
  for (const w of t.split(" ")) if (w in NUMBER_WORDS) found.push(NUMBER_WORDS[w]!);
  return found.length === 1 ? found[0] : undefined;
}

/** "3 days" -> 3, "2 weeks" -> 14, "teen mahine" -> 90. A bare number counts as days. */
export function parseDurationDays(text: string): number | undefined {
  const n = parseNumber(text);
  if (n === undefined) return undefined;
  const t = normalise(text);
  for (const [re, days] of UNIT_DAYS) if (re.test(t)) return Math.round(n * days);
  return n;
}

function phrasesFor(option: Option, lang: Lang): string[] {
  const words = OPTION_WORDS[option.id];
  return [option.label.en, option.label[lang], ...(words?.[lang] ?? []), ...(lang === "en" ? [] : (words?.en ?? []))].filter(
    (p): p is string => !!p,
  );
}

/**
 * Option ids whose label or synonym appears in the transcript.
 * For a single-choice question, a result is only returned when exactly one option matches.
 */
export function matchOptions(question: Question, transcript: string, lang: Lang): string[] | undefined {
  const t = normalise(transcript);
  let hits = question.options.filter((o) => phrasesFor(o, lang).some((p) => containsPhrase(t, p))).map((o) => o.id);
  // "no" and "none" share words; prefer the one the question actually has.
  if (hits.includes("no") && hits.includes("none")) hits = hits.filter((h) => h !== "none");
  if (question.kind === "single") return hits.length === 1 ? hits : undefined;
  // In a multi-select, an exclusive option ("None") only counts on its own.
  const exclusive = hits.filter((h) => question.options.find((o) => o.id === h)?.exclusive);
  if (exclusive.length > 0 && hits.length > exclusive.length) hits = hits.filter((h) => !exclusive.includes(h));
  return hits.length > 0 ? hits : undefined;
}

export interface AnswerMatch {
  /** The suggested answer, or undefined when nothing could be understood. */
  answer?: Answer;
  method: "dont_know" | "number" | "synonym" | "none";
}

/**
 * Rule-based reading of a spoken answer, with no AI: "I don't know", numbers and durations, option
 * labels and synonyms. The server tries the local LLM only when this returns "none"; the in-browser
 * demo uses this alone. The result is a suggestion the patient confirms before it is saved.
 */
export function matchAnswer(question: Question, transcript: string, lang: Lang): AnswerMatch {
  const base = { source: "voice" as const, transcript };
  if (isDontKnow(transcript, lang)) return { method: "dont_know", answer: { ...base, skipped: "dont_know", confidence: "high" } };

  if (question.kind === "duration" || question.kind === "number") {
    const n = question.kind === "duration" ? parseDurationDays(transcript) : parseNumber(transcript);
    if (n !== undefined) return { method: "number", answer: { ...base, value: n, confidence: "high" } };
  } else if (question.kind === "single" || question.kind === "multi") {
    const ids = matchOptions(question, transcript, lang);
    if (ids) return { method: "synonym", answer: { ...base, optionIds: ids, confidence: "high" } };
    // A short answer that is part of exactly one label ("ডান" -> "ডান হাত") is a likely match.
    const t = normalise(transcript);
    if (t.length >= 2) {
      const partial = question.options.filter((o) => [o.label.en, o.label[lang]].some((l) => l && ` ${normalise(l)} `.includes(` ${t} `)));
      if (partial.length === 1) return { method: "synonym", answer: { ...base, optionIds: [partial[0]!.id], confidence: "medium" } };
    }
  } else if (question.kind === "text") {
    return { method: "synonym", answer: { ...base, value: transcript.trim(), confidence: "high" } };
  }
  return { method: "none" };
}
