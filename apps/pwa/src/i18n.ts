/**
 * Fixed app wording (buttons, instructions) in each language, kept in ui-strings.json so the
 * voice-clip generator (services/speech/scripts/generate_clips.py) can record the same text.
 * Question and answer text comes from the question bank instead.
 * DRAFT translations: to be checked by native speakers before the pilot.
 */
import type { Lang } from "@setu/bank";
import STRINGS from "./ui-strings.json";

export type StringId = keyof typeof STRINGS;

export function ui(id: StringId, lang: Lang): string {
  return STRINGS[id][lang];
}

/** BCP-47 tags for the browser speech fallback. */
export const SPEECH_TAG: Record<Lang, string> = { en: "en-IN", bn: "bn-IN", hi: "hi-IN" };
