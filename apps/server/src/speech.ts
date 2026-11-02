/** Forwards recorded audio to the speech service (services/speech) and returns the transcript. */
import type { Lang } from "@setu/bank";

export interface Transcript {
  text: string;
  /** 0..1 from the recogniser, when it gives one. */
  confidence?: number;
}

export interface SpeechClient {
  transcribe(audio: Buffer, contentType: string, lang: Lang): Promise<Transcript>;
}

export class HttpSpeechClient implements SpeechClient {
  constructor(private readonly baseUrl: string) {}

  async transcribe(audio: Buffer, contentType: string, lang: Lang): Promise<Transcript> {
    const form = new FormData();
    form.append("lang", lang);
    form.append("audio", new Blob([new Uint8Array(audio)], { type: contentType }), "answer");
    const res = await fetch(`${this.baseUrl}/transcribe`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Speech service returned ${res.status}`);
    return (await res.json()) as Transcript;
  }
}
