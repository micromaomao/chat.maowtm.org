import { MsgType } from "db/enums";
import { DialogueItemInput, DialoguePath, DialoguePathElement, FetchedDialogueItemData } from "../api/v1/types";
import { Client as DBClient, withDBClient } from "../db/index";
import getConfigStore from "db/config";
import { APIError } from "../api/basics";
import { ListDialogueItemsResult } from "app/openapi";
import { deleteCachedMatcher } from "./match_dialogue";
import { ChatSessionEvent, ChatSessionEventType } from "db/mq";
import * as mq from "db/mq"
import { ChatMessageNotFoundError } from "./chat";

export class DialogueItemNotFoundError extends APIError {
  constructor(item_id: string) {
    super(404, `Dialogue item not found: ${item_id}`);
  }
}

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
        where item.item_id = $1`,
      values: [curr_id],
    });
    if (rows.length == 0) {
      throw new DialogueItemNotFoundError(curr_id);
    }
    res.push({
      dialogue_id: curr_id,
      canonical_phrasing_text: rows[0].canonical_phrasing,
    });
    curr_id = rows[0].parent_id;
    if (res.some(x => x.dialogue_id == curr_id)) {
      throw new Error("Dialogue item parent chain contains a cycle");
    }
  }
  res.reverse();
  return res;
}

export async function fetchDialogueItem(item_id: string, db: DBClient): Promise<FetchedDialogueItemData> {
  let { rows }: { rows: any[] } = await db.query({
    text: "select response, dialogue_group from dialogue_item where item_id = $1",
    values: [item_id],
  });
  if (rows.length == 0) {
    throw new DialogueItemNotFoundError(item_id);
  }
  let reply = rows[0].response;
  let group_id = rows[0].dialogue_group;
  return {
    reply,
    phrasings: await fetchDialogueItemPhrasings(item_id, db),
    path: await traceDialogueItemPath(item_id, db),
    group_id,
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
        q_text as text,
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
  if (to_remove.length > 0) {
    await db.query({
      text: "delete from dialogue_phrasing where id = any($1)",
      values: [to_remove.map(p => p.id)]
    });
  }
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
    throw new DialogueItemNotFoundError(item_id);
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
  let res = await db.query({
    text: "update dialogue_item set response = $1 where item_id = $2",
    values: [data.reply, item_id]
  });
  if (res.rowCount == 0) {
    throw new DialogueItemNotFoundError(item_id);
  }
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
      throw new DialogueItemNotFoundError(parent_id);
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

export interface MessageEditedEvent extends ChatSessionEvent {
  _event: ChatSessionEventType.MessageEdited;
  id: string;
  edited_item_id: string;
}

export async function _editMsgCommitEditLog(message_id: string, edited_item_id: string, db: DBClient): Promise<MessageEditedEvent> {
  let { rows }: { rows: any[] } = await db.query({
    text: "select session from chat_message where id = $1",
    values: [message_id]
  });
  if (rows.length == 0) {
    throw new ChatMessageNotFoundError(message_id);
  }
  let session_id = rows[0].session;
  const { rows: [{ id: edit_log_id }] } = await db.query({
    text: "insert into chat_reply_edit_log (reply_msg, edited_dialogue_item) values ($1, $2) returning id",
    values: [message_id, edited_item_id]
  });
  await db.query({
    text: "update chat_reply_metadata set last_edit = $2 where reply_msg = $1",
    values: [message_id, edit_log_id]
  });
  let evt: MessageEditedEvent = {
    _event: ChatSessionEventType.MessageEdited,
    id: message_id,
    edited_item_id,
  };
  mq.queue.emit(session_id, evt);
  return evt;
}

export async function editMsgAddNewChild(message_id: string, parent_id: string | null, dialogue_item_data: DialogueItemInput, db: DBClient): Promise<MessageEditedEvent> {
  const new_item_id = await newDialogueItem(dialogue_item_data, parent_id, db);
  let evt = await _editMsgCommitEditLog(message_id, new_item_id, db);
  deleteCachedMatcher();
  return evt;
}

export async function editMsgUpdateDialogueItem(message_id: string, item_id: string, dialogue_item_data: DialogueItemInput, db: DBClient): Promise<MessageEditedEvent> {
  await updateDialogueItem(item_id, dialogue_item_data, db);
  let evt = await _editMsgCommitEditLog(message_id, item_id, db);
  deleteCachedMatcher();
  return evt;
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
        mtd.matched_dialogue_items[1] as best_match_item_id,
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
        msg.exclude_from_generation = false and
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
    try {
      return await traceDialogueItemPath(row.best_match_item_id, db);
    } catch (e) {
      if (e instanceof DialogueItemNotFoundError) {
        return null;
      } else {
        throw e;
      }
    }
  }
  return null;
}

export async function fetchDialogueChildren(item_id: string, db: DBClient): Promise<DialoguePathElement[]> {
  let { rows } = await db.query({
    text: `
      select
        i.item_id as dialogue_id,
        p.q_text as canonical_phrasing_text
      from
        dialogue_item i
        left outer join dialogue_phrasing p
        on (i.canonical_phrasing = p.id)
      where i.parent = $1`,
    values: [item_id]
  });
  return rows as DialoguePathElement[];
}

export async function listAllRoot(db?: DBClient): Promise<ListDialogueItemsResult> {
  if (!db) {
    return await withDBClient(db => listAllRoot(db));
  }

  let { rows } = await db.query({
    name: "dialogue_items.ts#listAllRoot",
    text: `
      select
        g.id as group_id,
        i.item_id as dialogue_id,
        p.q_text as canonical_phrasing_text
      from
        dialogue_group g
        left outer join dialogue_item i
          on (g.id = i.dialogue_group and i.parent is null)
        left outer join dialogue_phrasing p
          on (i.canonical_phrasing = p.id)`
  });
  let res: ListDialogueItemsResult = {
    groups: []
  };
  let group_objs = new Map<string, any>();
  for (let row of rows) {
    let group_obj;
    if (!group_objs.has(row.group_id)) {
      group_obj = {
        group_id: row.group_id,
        items: []
      };
      group_objs.set(row.group_id, group_obj);
      res.groups.push(group_obj);
    } else {
      group_obj = group_objs.get(row.group_id);
    }

    if (row.dialogue_id !== null) {
      group_obj.items.push({
        dialogue_id: row.dialogue_id,
        canonical_phrasing_text: row.canonical_phrasing_text
      });
    }
  }
  return res;
}

export async function fetchChildrenIds(item_id: string, recursive: boolean, db: DBClient): Promise<string[]> {
  let children = new Set<string>();
  let fetch_head = [item_id];
  let depth = 0;
  while (fetch_head.length > 0) {
    if (depth != 0 && !recursive) {
      break;
    }
    let { rows }: { rows: { item_id: string }[] } = await db.query({
      text: `select item_id from dialogue_item where parent = any($1)`,
      values: [fetch_head]
    });
    if (rows.some(x => children.has(x.item_id))) {
      throw new Error("Dialogue item parent chain contains a cycle");
    }
    for (let row of rows) {
      children.add(row.item_id);
    }
    fetch_head = rows.map(x => x.item_id);
  }
  return Array.from(children);
}

export async function deleteDialogueItem(item_id: string, recursive: boolean, db: DBClient): Promise<void> {
  let { rows }: { rows: { parent: string }[] } = await db.query({
    text: "select parent from dialogue_item where item_id = $1",
    values: [item_id]
  });
  if (rows.length == 0) {
    throw new DialogueItemNotFoundError(item_id);
  }

  let children = await fetchChildrenIds(item_id, recursive, db);

  if (recursive) {
    if (process.env.NODE_ENV == "development") {
      console.log("Deleting dialogue items:", children, item_id);
    }
    await db.query({
      text: "delete from dialogue_item where item_id = any($1) or item_id = $2",
      values: [children, item_id]
    });
  } else {
    await db.query({
      text: "update dialogue_item set parent = $1 where parent = $2",
      values: [rows[0].parent, item_id]
    })
    await db.query({
      text: "delete from dialogue_item where item_id = $1",
      values: [item_id]
    });
  }
  deleteCachedMatcher();
}
