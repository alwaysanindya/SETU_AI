/**
 * Plays a question aloud.
 *
 * Production: every question and app phrase is pre-recorded with Indic Parler-TTS
 * (services/speech/scripts/generate_clips.py), reviewed by a native speaker, and served from
 * /audio/<voice>/<lang>/<key>.mp3. Pre-recorded clips sound the same every time and need no GPU
 * while patients are waiting.
 *
 * If a clip is missing (new question not yet recorded), the phone's own text-to-speech is used
 * as a stop-gap so development is not blocked.
 */
import type { Lang } from "@setu/bank";
import { SPEECH_TAG } from "../i18n";

export type Voice = "female" | "male";

let current: HTMLAudioElement | undefined;

export function stopSpeaking() {
  current?.pause();
  current = undefined;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Clip key for a question: "<scope>__<questionId>", e.g. "chest-pain__intensity". */
export function clipKey(scope: string, id: string): string {
  return `${scope}__${id}`;
}

export async function speak(text: string, lang: Lang, voice: Voice, key?: string): Promise<void> {
  stopSpeaking();
  if (key) {
    const audio = new Audio(`/audio/${voice}/${lang}/${key}.mp3`);
    current = audio;
    try {
      await audio.play();
      return;
    } catch {
      // No clip yet: fall through to the phone's voice.
    }
  }
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_TAG[lang];
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith(lang));
  const preferred = voices.find((v) => (voice === "female" ? /female|woman/i : /male|man/i).test(v.name)) ?? voices[0];
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}
