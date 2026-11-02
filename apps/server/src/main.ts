/** Starts the clinic server. Configuration: see config.ts. */
import { buildApp } from "./app";
import { loadBank } from "./bank";
import { loadConfig } from "./config";
import { OpenAiCompatibleGateway } from "./llm/gateway";
import { HttpSpeechClient } from "./speech";
import { InMemorySessionStore } from "./store";

const config = loadConfig();
const bank = await loadBank(config.bankPath);
const app = buildApp({
  bank,
  store: new InMemorySessionStore(),
  llm: config.llmUrl ? new OpenAiCompatibleGateway(config.llmUrl, config.llmModel, config.llmTimeoutMs) : undefined,
  speech: config.speechUrl ? new HttpSpeechClient(config.speechUrl) : undefined,
  logger: true,
});
await app.listen({ port: config.port, host: config.host });
app.log.info(`Question bank ${bank.version}: ${bank.complaints.length} complaints`);
