import { MsgType } from "db/enums";
import { DialogueItemInput, DialoguePath, FetchedDialogueItemData } from "../api/v1/types";
import { Client as DBClient } from "../db/index";
import getConfigStore from "db/config";

export async function traceDialogueItemPath(item_id: string, db: DBClient): Promise<DialoguePath> {
  let res: DialoguePath = [];
  let curr_id = item_id;
  while (curr_id !== null) {
    let { rows }: { rows: any[] } = await db.query({
      name: "dialogue_items.ts#traceDialogueItemPath",
      text: `
        select
          item.parent as parent_id,
          ph.q_text as canonical_phrasing
        from dialogue_item item
          left outer join dialogue_phrasing ph
            on (ph.id = item.canonical_phrasing)
        where item.id = $1`,
      values: [item_id],
    });
    if (rows.length == 0) {
      throw new Error("Dialogue item not found");
    }
    res.push({
      dialogue_id: curr_id,
      canonical_phrasing_text: rows[0].canonical_phrasing,
    });
    curr_id = rows[0].parent_id;
  }
  return res;
}

export async function fetchDialogueItem(item_id: string, db: DBClient): Promise<FetchedDialogueItemData> {
  let { rows }: { rows: any[] } = await db.query({
    text: "select response from dialogue_item where id = $1",
    values: [item_id],
  });
  if (rows.length == 0) {
    throw new Error("Dialogue item not found");
  }
  let reply = rows[0].response;
  return {
    reply,
    phrasings: await fetchDialogueItemPhrasings(item_id, db),
    path: await traceDialogueItemPath(item_id, db),
  };
}

export async function createPhrasingEmbedding(phrasing_id: string, q_text: string, db: DBClient, abort?: AbortSignal): Promise<void> {
  let conf_store = await getConfigStore();
  let emb_res = await conf_store.embedding_model.getEmbeddings(q_text, {}, abort);
  await db.query({
    text: `
      insert into dialogue_phrasing_embedding
        (phrasing, model, embedding, nb_tokens)
      values ($1, $2, $3::jsonb, $4)`,
    values: [
      phrasing_id,
      conf_store.embedding_model.model_name,
      JSON.stringify(emb_res.embedding),
      emb_res.total_tokens
    ],
  });
}

export async function updateItemPhrasings(item_id: string, new_phrasings: string[], db: DBClient): Promise<void> {
  let new_phrasing_set = new Set(new_phrasings);

  if (new_phrasings.length == 0) {
    throw new Error("At least one phrasing must be specified");
  }

  if (new_phrasing_set.size != new_phrasings.length) {
    throw new Error("Duplicate phrasings");
  }

  interface PhrasingObj { id: string | null, text: string, has_embedding: boolean };

  let conf_store = await getConfigStore();
  let { rows: existing_phrasings }: { rows: PhrasingObj[] } = await db.query({
    name: "dialogue_items.ts#updateItemPhrasings",
    text: `
      select
        ph.id as id,
        q_text as text
        emb.phrasing is not null as has_embedding
      from dialogue_phrasing ph
        left outer join dialogue_phrasing_embedding emb
          on (ph.id = emb.phrasing and emb.model = $1)
      where ph.dialogue_item = $2 and ph.is_counterexample = false`,
    values: [conf_store.embedding_model.model_name, item_id]
  });
  let existing_phrasing_map = new Map<string, PhrasingObj>(existing_phrasings.map(p => [p.text, p]));
  let to_add: PhrasingObj[] = [];
  let to_embed: PhrasingObj[] = [];
  let to_remove: PhrasingObj[] = [];
  for (let new_ptext of new_phrasings) {
    if (!existing_phrasing_map.has(new_ptext)) {
      let obj: PhrasingObj = { id: null, text: new_ptext, has_embedding: false };
      to_add.push(obj);
      to_embed.push(obj);
      existing_phrasing_map.set(new_ptext, obj);
    } else {
      let obj = existing_phrasing_map.get(new_ptext)!;
      if (!obj.has_embedding) {
        to_embed.push(obj);
      }
    }
  }
  for (let obj of existing_phrasings) {
    if (!new_phrasing_set.has(obj.text)) {
      to_remove.push(obj);
    }
  }
  for (let obj of to_add) {
    let { rows: [{ id }] }: { rows: any[] } = await db.query({
      text: "insert into dialogue_phrasing (dialogue_item, q_text) values ($1, $2) returning id",
      values: [item_id, obj.text]
    });
    obj.id = id;
  }
  let canonical_id = null;
  if (new_phrasings.length > 0) {
    canonical_id = existing_phrasing_map.get(new_phrasings[0])!.id!;
  }
  await db.query({
    text: "update dialogue_item set canonical_phrasing = $1 where item_id = $2",
    values: [canonical_id, item_id]
  });
  await db.query({
    text: "delete from dialogue_phrasing where id = any($1)",
    values: [to_remove.map(p => p.id)]
  });
  for (let obj of to_embed) {
    await createPhrasingEmbedding(obj.id!, obj.text, db);
  }
}

export async function fetchDialogueItemPhrasings(item_id: string, db: DBClient): Promise<string[]> {
  let { rows }: { rows: any[] } = await db.query({
    text: "select canonical_phrasing from dialogue_item where item_id = $1",
    values: [item_id]
  });
  if (rows.length == 0) {
    throw new Error("Dialogue item not found");
  }
  let canonical_phrasing_id: string | null = rows[0].canonical_phrasing;
  rows = (await db.query({
    text: "select id, q_text from dialogue_phrasing where dialogue_item = $1 and is_counterexample = false",
    values: [item_id]
  })).rows;
  let res = [];
  for (let row of rows) {
    if (row.id == canonical_phrasing_id) {
      res.push(row.q_text);
    }
  }
  for (let row of rows) {
    if (row.id != canonical_phrasing_id) {
      res.push(row.q_text);
    }
  }
  return res;
}

export async function updateDialogueItem(item_id: string, data: DialogueItemInput, db: DBClient): Promise<void> {
  await db.query({
    text: "update dialogue_item set response = $1 where item_id = $2",
    values: [data.reply, item_id]
  });
  await updateItemPhrasings(item_id, data.phrasings, db);
}

export async function newDialogueItem(data: DialogueItemInput, parent_id: string | null, db: DBClient): Promise<string> {
  let dialogue_group_id: string;
  if (parent_id !== null) {
    let { rows }: { rows: any[] } = await db.query({
      text: "select dialogue_group as group_id from dialogue_item where item_id = $1",
      values: [parent_id]
    });
    if (rows.length == 0) {
      throw new Error("Parent item not found");
    }
    dialogue_group_id = rows[0].group_id;
  } else {
    let { rows: [{ id }] }: { rows: any[] } = await db.query({
      text: "insert into dialogue_group default values returning id"
    });
    dialogue_group_id = id;
  }
  let { rows: [{ item_id }] } = await db.query({
    text: `
      insert into dialogue_item
        (dialogue_group, parent, response)
      values ($1, $2, $3) returning item_id`,
    values: [dialogue_group_id, parent_id, data.reply]
  });
  await updateItemPhrasings(item_id, data.phrasings, db);
  return item_id;
}

export async function _editMsgCommitEditLog(message_id: string, edited_item_id: string, db: DBClient): Promise<void> {
  const { rows: [{ id: edit_log_id }] } = await db.query({
    text: "insert into chat_reply_edit_log (reply_msg, edited_dialogue_item) values ($1, $2) returning id",
    value: [message_id, edited_item_id]
  });
  await db.query({
    text: "update chat_reply_metadata where reply_msg = $1 set last_edit = $2",
    values: [message_id, edit_log_id]
  });
}

export async function editMsgAddNewChild(message_id: string, parent_id: string | null, dialogue_item_data: DialogueItemInput, db: DBClient): Promise<void> {
  const new_item_id = await newDialogueItem(dialogue_item_data, parent_id, db);
  await _editMsgCommitEditLog(message_id, new_item_id, db);
}

export async function editMsgUpdateDialogueItem(message_id: string, item_id: string, dialogue_item_data: DialogueItemInput, db: DBClient): Promise<void> {
  await updateDialogueItem(item_id, dialogue_item_data, db);
  await _editMsgCommitEditLog(message_id, item_id, db);
}

export async function fetchMessageEditedDialogueItem(message_id: string, db: DBClient): Promise<FetchedDialogueItemData | null> {
  const { rows }: { rows: any[] } = await db.query({
    name: "dialogue_items.ts#fetchMessageEditedDialogueItem",
    text: `
      select
        el.edited_dialogue_item as item_id
      from
        chat_reply_metadata mtd
        inner join chat_reply_edit_log el on (mtd.last_edit = el.id)
      where
        mtd.reply_msg = $1`,
    values: [message_id]
  });
  if (rows.length == 0) {
    return null;
  }
  const item_id = rows[0].item_id;
  return await fetchDialogueItem(item_id, db);
}

export async function tracePrevReplyMsgDialoguePath(message_id: string, db: DBClient): Promise<DialoguePath | null> {
  const { rows }: { rows: any[] } = await db.query({
    name: "dialogue_items.ts#findPrevReplyMsgDialogueItem",
    text: `
      select
        msg.id as msg_id,
        mtd.best_match_dialogue as best_match_item_id,
        el.edited_dialogue_item as edited_item_id
      from
        chat_message msg
        left outer join chat_reply_metadata mtd on (msg.id = mtd.reply_msg)
        left outer join chat_reply_edit_log el on (mtd.last_edit = el.id)
      where
        msg.session = (
          select session from chat_message where id = $1
        ) and
        msg.msg_type = ${MsgType.Bot} and
        msg.id < $1
      order by msg_id desc
      limit 1`,
    values: [message_id]
  });
  if (rows.length == 0) {
    return null;
  }
  let row = rows[0];
  if (row.edited_item_id !== null) {
    return await traceDialogueItemPath(row.edited_item_id, db);
  }
  if (row.best_match_item_id !== null) {
    return await traceDialogueItemPath(row.best_match_item_id, db);
  }
  return null;
}
