/** All settings come from environment variables, with defaults that work on a developer laptop. */
import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  host: string;
  /** Path to the compiled question bank (content/bank/bank.json). */
  bankPath: string;
  /** OpenAI-compatible endpoint of the local LLM (llama.cpp `llama-server`). Empty = LLM off, synonyms only. */
  llmUrl: string;
  llmModel: string;
  llmTimeoutMs: number;
  /** The speech service (services/speech). Empty = voice input off. */
  speechUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    bankPath: env.SETU_BANK_PATH ?? fileURLToPath(new URL("../../../content/bank/bank.json", import.meta.url)),
    llmUrl: env.SETU_LLM_URL ?? "http://localhost:8081/v1",
    llmModel: env.SETU_LLM_MODEL ?? "qwen3.5-9b-instruct",
    llmTimeoutMs: Number(env.SETU_LLM_TIMEOUT_MS ?? 8000),
    speechUrl: env.SETU_SPEECH_URL ?? "http://localhost:8082",
  };
}
