/**
 * Listening to a spoken answer. Two ways, same interface:
 *
 *  - Clinic build: record audio on the phone and send it to the clinic's own speech service
 *    (open-source IndicConformer). Nothing leaves the clinic.
 *  - Demo build: the browser's built-in speech recognition (Chrome on Android or desktop). This is a
 *    stand-in so the demo works from a plain link; it is not the production design, because the
 *    browser may send audio to its vendor's servers.
 */
import type { Lang } from "@setu/bank";
import { api, DEMO } from "../api";
import { SPEECH_TAG } from "../i18n";
import { startRecording } from "./record";

export interface Listening {
  /** Resolves with what was heard ("" if nothing) once the patient stops or goes quiet. */
  result: Promise<string>;
  /** Stop listening now and use what was heard so far. */
  stop(): void;
}

export class MicUnavailableError extends Error {}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function browserRecognition(): (new () => Recognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function canListen(): boolean {
  if (DEMO) return !!browserRecognition();
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export async function startListening(lang: Lang, onPartial: (text: string) => void): Promise<Listening> {
  if (DEMO) return listenInBrowser(lang, onPartial);
  let recording;
  try {
    recording = await startRecording();
  } catch {
    throw new MicUnavailableError();
  }
  let stopped = false;
  let stopNow: () => void = () => {};
  const stopSignal = new Promise<void>((r) => (stopNow = r));
  const result = (async () => {
    await stopSignal;
    const audio = await recording.stop();
    const { text } = await api.transcribe(audio, lang);
    return text;
  })();
  return {
    result,
    stop() {
      if (!stopped) {
        stopped = true;
        stopNow();
      }
    },
  };
}

function listenInBrowser(lang: Lang, onPartial: (text: string) => void): Promise<Listening> {
  const Rec = browserRecognition();
  if (!Rec) return Promise.reject(new MicUnavailableError());
  const rec = new Rec();
  rec.lang = SPEECH_TAG[lang];
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let heard = "";
  let failed: string | undefined;
  const result = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      heard = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      onPartial(heard);
    };
    rec.onerror = (e) => {
      failed = e.error;
    };
    rec.onend = () => {
      if (failed === "not-allowed" || failed === "service-not-allowed" || failed === "audio-capture") reject(new MicUnavailableError(failed));
      else resolve(heard);
    };
  });
  return new Promise((resolve, reject) => {
    try {
      rec.start();
    } catch {
      reject(new MicUnavailableError());
      return;
    }
    resolve({ result, stop: () => rec.stop() });
  });
}
