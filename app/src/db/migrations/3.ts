/**
 * Migration script from db version 2 to 3.
 *
 * Run with export `cat ../../../.env.local` && npx ts-node 3.ts
 */

import { Client } from "pg";

const client = new Client({
  connectionString: process.env.POSTGRESQL_URL
});
client.on("error", err => {
  console.error(err);
});
let _query = client.query;
client.query = function(...args) {
  let sql;
  if (typeof args[0] === "string") {
    sql = args[0];
  } else {
    sql = args[0].text;
  }
  console.log("SQL", sql.trim());
  return _query.apply(this, args);
};

run_migration(client).then(() => {
  console.log("Done");
  process.exit(0);
}, err => {
  console.error(err);
  process.exit(1);
});

async function run_migration(db: Client) {
  await db.connect();

  await db.query(`
    update db_migration_state set db_compat_version = 3 where db_compat_version = 2;

    alter table chat_reply_metadata add column matched_dialogue_items text[] not null default '{}';
    alter table chat_reply_metadata add column matched_item_scores float8[] not null default '{}';
  `);

  let { rows: phrasing_rows } = await db.query(`
    select id, dialogue_item from dialogue_phrasing
  `);

  let phrasing_to_item = new Map<string, string>();
  for (let r of phrasing_rows) {
    phrasing_to_item.set(r.id, r.dialogue_item);
  }

  const { rows } = await db.query(`
    select reply_msg, matched_phrasings, match_scores, best_match_dialogue from chat_reply_metadata order by reply_msg asc
  `);

  console.log(`Migrating ${rows.length} rows...`);

  for (const row of rows) {
    console.log(row.reply_msg);
    let { reply_msg, matched_phrasings, match_scores, best_match_dialogue } = row;
    if (matched_phrasings.length === 0) {
      continue;
    }
    let dialogue_items = new Map<string, number>();
    for (let i = 0; i < matched_phrasings.length; i++) {
      let phrasing = matched_phrasings[i];
      let score = match_scores[i];
      let item_id = phrasing_to_item.get(phrasing);
      if (!item_id) {
        console.warn(`Phrasing ${phrasing} deleted`);
        continue;
      }
      if (dialogue_items.has(item_id)) {
        dialogue_items.set(item_id, Math.max(dialogue_items.get(item_id), score));
      } else {
        dialogue_items.set(item_id, score);
      }
    }

    if (!dialogue_items.has(best_match_dialogue)) {
      // Work around deleted phrasings
      dialogue_items.set(best_match_dialogue, 1);
    }

    let matched_dialogue_items_and_scores = Array.from(dialogue_items.entries()).sort((a, b) => b[1] - a[1]);
    let matched_dialogue_items = matched_dialogue_items_and_scores.map(([item_id, score]) => item_id);
    let matched_item_scores = matched_dialogue_items_and_scores.map(([item_id, score]) => score);
    await db.query({
      text: `
        update chat_reply_metadata
        set matched_dialogue_items = $1, matched_item_scores = $2
        where reply_msg = $3
      `,
      values: [matched_dialogue_items, matched_item_scores, reply_msg],
    });
  }

  await db.query(`
    alter table chat_reply_metadata alter column matched_dialogue_items drop default;
    alter table chat_reply_metadata alter column matched_item_scores drop default;
  `)

  // await db.query(`
  //   alter table chat_reply_metadata drop column matched_phrasings;
  //   alter table chat_reply_metadata drop column match_scores;
  //   alter table chat_reply_metadata drop column best_match_dialogue;
  // `);
  // Actually let's keep these around for now, just in case
  await db.query(`
    alter table chat_reply_metadata alter column matched_phrasings drop not null;
    alter table chat_reply_metadata alter column match_scores drop not null;
    alter table chat_reply_metadata drop constraint chat_reply_metadata_best_match_dialogue_fkey;
  `);

  await db.query(`
    alter table chat_reply_metadata drop column regen_of;
  `);
}
