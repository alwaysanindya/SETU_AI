import { readFile } from "node:fs/promises";
import { Bank } from "@setu/bank";

/** Loads and validates the compiled bank. Fails fast at start-up if the file is missing or invalid. */
export async function loadBank(path: string): Promise<Bank> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return Bank.parse(raw);
}
