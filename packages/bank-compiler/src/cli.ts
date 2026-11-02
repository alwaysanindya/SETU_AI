#!/usr/bin/env -S npx tsx
/**
 * Usage: pnpm bank:build            (from the repo root)
 *        tsx src/cli.ts --content <content dir>
 *
 * Writes <content>/bank/bank.json and <content>/bank/report.md. Exits with code 1 on errors.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compileBank } from "./compile";
import { renderReport } from "./report";

const arg = process.argv.indexOf("--content");
const contentDir = resolve(arg >= 0 ? process.argv[arg + 1] ?? "content" : "content");

const { bank, diagnostics } = await compileBank(contentDir);
await mkdir(join(contentDir, "bank"), { recursive: true });
await writeFile(join(contentDir, "bank", "report.md"), renderReport(bank, diagnostics));

const count = (s: string) => diagnostics.items.filter((d) => d.severity === s).length;
console.log(`errors: ${count("error")}, corrections: ${count("correction")}, warnings: ${count("warning")}`);
for (const e of diagnostics.errors) console.error(`ERROR ${e.where}: ${e.message}`);

if (!bank) {
  console.error("Build failed; see content/bank/report.md");
  process.exit(1);
}
await writeFile(join(contentDir, "bank", "bank.json"), JSON.stringify(bank, null, 2) + "\n");
console.log(`Wrote bank ${bank.version} (${bank.complaints.length} complaints) to ${join(contentDir, "bank", "bank.json")}`);
