import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse } from "dotenv";
import { Client } from "pg";

export function argumentsFor(extra: Record<string, { type: "string" | "boolean"; default?: string | boolean }> = {}): Record<string, string | boolean> {
  const { values } = parseArgs({
    options: { "secrets-file": { type: "string" }, ...extra },
    strict: true,
  });
  if (typeof values["secrets-file"] === "string") {
    for (const [key, value] of Object.entries(parse(readFileSync(values["secrets-file"])))) {
      process.env[key] ??= value;
    }
  }
  return values;
}

export function database(): Client {
  const connectionString = process.env.POSTGRESQL_URL || process.env.CHAT_NEON_DATABASE_URL;
  if (!connectionString) throw new Error("Set POSTGRESQL_URL to the target Neon branch's direct connection string");
  return new Client({ connectionString, connectionTimeoutMillis: 10000 });
}
