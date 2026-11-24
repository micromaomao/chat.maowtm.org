import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { argumentsFor, database } from "./environment";
import { defaultConfig } from "../src/db/default_config";
import { DEFAULT_EMBEDDING_MODEL, estimateTokens } from "../src/lib/llm/models";
import { parseEmbeddings } from "../src/lib/llm/workers_ai";
import { generateToken } from "../src/lib/secure_token/nodejs";
import { validateConfig } from "../src/api/validation";
import packageJson from "../package.json";
import type { Config } from "../src/db/config";

async function main() {
  const args = argumentsFor({
    "worker-url": { type: "string" },
    model: { type: "string", default: DEFAULT_EMBEDDING_MODEL },
    activate: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  });
  const model = String(args.model);
  if (!model.startsWith("@cf/")) throw new Error("Use a Workers AI model ID");
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CHAT_CF_WORKER_ACCOUNT_ID;
  const aiToken = process.env.CLOUDFLARE_AI_TOKEN;
  const workerUrl = args["worker-url"] ? new URL(String(args["worker-url"])) : null;
  if (!workerUrl && (!account || !aiToken)) {
    throw new Error("Pass --worker-url or set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN (Workers AI Read permission)");
  }
  if (workerUrl && workerUrl.protocol !== "https:" && workerUrl.hostname !== "localhost" && workerUrl.hostname !== "127.0.0.1") {
    throw new Error("A remote Worker must use HTTPS");
  }
  const db = database();
  await db.connect();
  let temporaryHash: Buffer | null = null;
  try {
    const { rows: [original] } = await db.query<{ id: string; config: Config }>(
      "select id, config from global_configuration order by id desc limit 1"
    );
    if (!original) throw new Error("Run npm run db:migrate first");
    let adminToken: string;
    if (workerUrl) {
      const [token, hash] = await generateToken();
      adminToken = token;
      temporaryHash = hash;
      await db.query("insert into admin_token (token, expiry) values ($1, now() + interval '1 hour')", [hash]);
    }
    const embed = async (texts: string[]): Promise<number[][]> => {
      if (texts.some(text => !text || estimateTokens(text) > 7900)) {
        throw new Error("An embedding input is empty or exceeds the safe 8k context budget; no input was truncated");
      }
      const url = workerUrl ?
        new URL("/api/v1/debug-embeddings", workerUrl).href :
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${workerUrl ? adminToken : aiToken}`,
        },
        body: JSON.stringify(workerUrl ? { model, input: texts } : { text: texts }),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error(`Embedding request failed (${response.status}): ${await response.text()}`);
      const body = await response.json();
      if (workerUrl) return parseEmbeddings(body, texts.length);
      if (typeof body !== "object" || body === null || !("success" in body) || body.success !== true || !("result" in body)) {
        throw new Error("Workers AI rejected the embedding request");
      }
      return parseEmbeddings(body.result, texts.length);
    };

    for (const kind of ["dialogue", "chat"] as const) {
      let cursor = "";
      let completed = 0;
      for (;;) {
        const { rows } = await db.query<{ id: string; text: string }>(kind === "dialogue" ?
          `select p.id, p.q_text as text from dialogue_phrasing p
           left join dialogue_phrasing_embedding e on e.phrasing = p.id and e.model = $1
           where p.id > $2 and ($3 or e.phrasing is null or e.source_text is distinct from p.q_text)
           order by p.id limit 32` :
          `select m.id, m.content as text from chat_message m
           left join chat_message_embedding e on e.msg = m.id and e.model = $1
           where m.msg_type = 1 and m.id > $2 and ($3 or e.msg is null)
           order by m.id limit 32`,
        [model, cursor, Boolean(args.force)]);
        if (!rows.length) break;
        const vectors = await embed(rows.map(row => row.text));
        await db.query("begin");
        try {
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const result = await db.query(kind === "dialogue" ?
              `insert into dialogue_phrasing_embedding (phrasing, model, embedding, nb_tokens, source_text)
               select id, $1, $2::jsonb, $3, q_text from dialogue_phrasing where id = $4 and q_text = $5
               on conflict (phrasing, model) do update set embedding = excluded.embedding,
               nb_tokens = excluded.nb_tokens, source_text = excluded.source_text, generation_time = now()` :
              `insert into chat_message_embedding (msg, model, embedding, nb_tokens)
               select id, $1, $2::jsonb, $3 from chat_message where id = $4 and content = $5
               on conflict (msg, model) do update set embedding = excluded.embedding, nb_tokens = excluded.nb_tokens`,
            [model, JSON.stringify(vectors[index]), estimateTokens(row.text), row.id, row.text]);
            if (result.rowCount !== 1) throw new Error(`Source ${row.id} changed during re-embedding; rerun the script`);
          }
          await db.query("commit");
        } finally {
          await db.query("rollback");
        }
        cursor = rows[rows.length - 1].id;
        completed += rows.length;
        console.log(`${kind}: wrote ${completed} embeddings`);
      }
    }
    if (args.activate) await activate(db, original, model);
    else console.log("Embeddings are ready. Model configuration was not changed; rerun with --activate to switch.");
  } finally {
    try {
      if (temporaryHash) await db.query("delete from admin_token where token = $1", [temporaryHash]);
    } finally {
      await db.end();
    }
  }
}

async function activate(db: Client, original: { id: string; config: Config }, model: string) {
  await db.query("begin");
  try {
    await db.query("select pg_advisory_xact_lock(42001)");
    const { rows: [latest] } = await db.query("select id from global_configuration order by id desc limit 1");
    if (latest.id !== original.id) throw new Error("Configuration changed during re-embedding; rerun to activate without overwriting it");
    await db.query("lock table dialogue_phrasing, dialogue_phrasing_embedding in share mode");
    const missing = await db.query(
      `select count(*)::int as count from dialogue_phrasing p
       left join dialogue_phrasing_embedding e on e.phrasing = p.id and e.model = $1
       where e.phrasing is null or e.source_text is distinct from p.q_text`, [model]
    );
    if (missing.rows[0].count) throw new Error("Some dialogue embeddings are missing or stale; rerun before activating");
    const defaults = defaultConfig(readFileSync(resolve("src/db/default_prompt_template.txt"), "utf8"));
    const config = {
      ...defaults,
      ...original.config,
      embedding_model: { type: "workers-ai", name: model, config: {} },
      generation_model: original.config.generation_model.type === "workers-ai" ?
        original.config.generation_model : defaults.generation_model,
    };
    validateConfig(config);
    await db.query("insert into global_configuration (config, app_version) values ($1, $2)", [config, packageJson.version]);
    await db.query("commit");
    console.log("Activated Workers AI models; prompt, initial messages, and other application settings were preserved.");
  } finally {
    await db.query("rollback");
  }
}

main().catch(error => {
  console.error("Re-embedding failed:", error.message);
  process.exitCode = 1;
});
