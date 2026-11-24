import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { argumentsFor, database } from "./environment";
import { defaultConfig } from "../src/db/default_config";
import packageJson from "../package.json";

async function main() {
  argumentsFor();
  const db = database();
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(42000)");
    const { rows: [state] } = await db.query("select to_regclass('public.db_migration_state') as name");
    if (!state.name) {
      await db.query(readFileSync(resolve("src/db/schema.sql"), "utf8"));
    }
    const { rows } = await db.query("select db_compat_version as version from db_migration_state for update");
    if (rows.length !== 1) throw new Error("db_migration_state must have exactly one row");
    if (rows[0].version === 4) {
      await db.query(readFileSync(resolve("src/db/migrations/5.sql"), "utf8"));
    } else if (rows[0].version !== 5) {
      throw new Error(`Expected database version 4 or 5; found ${rows[0].version}. Apply historical migrations first.`);
    }
    const existing = await db.query("select id from global_configuration limit 1");
    if (!existing.rows.length) {
      await db.query("insert into global_configuration (config, app_version) values ($1, $2)", [
        defaultConfig(readFileSync(resolve("src/db/default_prompt_template.txt"), "utf8")),
        packageJson.version,
      ]);
    }
    await db.query("commit");
    console.log("Database schema is at version 5. Existing data and model configuration were preserved.");
  } finally {
    try {
      await db.query("rollback");
    } finally {
      await db.end();
    }
  }
}

main().catch(error => {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});
