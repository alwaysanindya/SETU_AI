/**
 * The local LLM, reached through the OpenAI-compatible API that llama.cpp's `llama-server` provides
 * (Qwen 3.5 9B by default). It is only asked to place a spoken answer among the allowed options.
 * Its output is forced into a JSON schema that lists only those options, so it cannot invent answers.
 * It never decides which question comes next, never sees red-flag logic and never writes the note.
 */
import type { Lang, Question } from "@setu/bank";

export interface LlmChoice {
  optionIds: string[];
  value?: number | string;
  dontKnow: boolean;
  confidence: "high" | "medium" | "low";
}

export interface LlmGateway {
  interpret(question: Question, transcript: string, lang: Lang): Promise<LlmChoice | undefined>;
}

const LANG_NAME: Record<Lang, string> = { en: "English", bn: "Bengali", hi: "Hindi" };

function schemaFor(question: Question) {
  const ids = question.options.map((o) => o.id);
  const valueSchema =
    question.kind === "duration" || question.kind === "number"
      ? { type: ["number", "null"] }
      : question.kind === "date" || question.kind === "text"
        ? { type: ["string", "null"] }
        : { type: "null" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["optionIds", "value", "dontKnow", "confidence"],
    properties: {
      optionIds: { type: "array", items: ids.length > 0 ? { enum: ids } : { type: "string" }, maxItems: Math.max(ids.length, 0) },
      value: valueSchema,
      dontKnow: { type: "boolean" },
      confidence: { enum: ["high", "medium", "low"] },
    },
  };
}

export function buildPrompt(question: Question, transcript: string, lang: Lang): { system: string; user: string } {
  const options = question.options.map((o) => `- ${o.id}: ${o.label.en}${o.label[lang] ? ` / ${o.label[lang]}` : ""}`).join("\n");
  const kindHelp: Record<Question["kind"], string> = {
    single: "Choose exactly one option id, or none if the answer does not fit any option.",
    multi: "Choose every option id the patient mentioned.",
    duration: "Put the duration in DAYS in value (1 week = 7, 1 month = 30, 1 year = 365).",
    number: "Put the number in value.",
    date: "Put the date in value as YYYY-MM-DD.",
    text: "Put a short English summary of what the patient said in value.",
  };
  return {
    system:
      "You map a patient's spoken answer to a clinic questionnaire. You do not give medical advice. " +
      "Use only the option ids listed. If the patient says they do not know, set dontKnow to true. " +
      "If you are not sure, set confidence to low rather than guessing.",
    user:
      `Question: ${question.text.en}\n` +
      (options ? `Options:\n${options}\n` : "") +
      `${kindHelp[question.kind]}\n` +
      `The patient answered in ${LANG_NAME[lang]} (speech recognition, may contain errors):\n"${transcript}"`,
  };
}

export class OpenAiCompatibleGateway implements LlmGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async interpret(question: Question, transcript: string, lang: Lang): Promise<LlmChoice | undefined> {
    const { system, user } = buildPrompt(question, transcript, lang);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: schemaFor(question) } },
      }),
    });
    if (!res.ok) throw new Error(`LLM returned ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return undefined;
    const parsed = JSON.parse(content) as LlmChoice & { value: number | string | null };
    const known = new Set(question.options.map((o) => o.id));
    return {
      optionIds: (parsed.optionIds ?? []).filter((id) => known.has(id)),
      value: parsed.value ?? undefined,
      dontKnow: !!parsed.dontKnow,
      confidence: parsed.confidence ?? "low",
    };
  }
}
