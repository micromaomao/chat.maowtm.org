import getConfigStore from "../db/config";
import { Client as DBClient, withDBClient } from "../db";
import { countTokens } from "./ai/openai";
import * as mq from "../db/messages";
import { FetchedChatMessage, FetchedChatMessageMetadata, NewChatSessionResult, msgTypeToStr } from "../api/v1/types"
import { MsgType } from "../db/enums";
import client_tags from "../db/client_tag";
import { nestProperties } from "./utils";
import { generateToken } from "./secure_token";

interface FetchLastChatMessagesOptions {
  session_id: string;
  until?: string;
  limit: number;
  db_client?: DBClient;
  is_admin?: boolean;
}

export async function fetchLastChatMessages(opts: FetchLastChatMessagesOptions): Promise<FetchedChatMessage[]> {
  if (!opts.db_client) {
    return await withDBClient(db => fetchLastChatMessages({ ...opts, db_client: db }));
  }
  let db = opts.db_client;
  let { rows } = await db.query({
    name: "fetchLastChatMessages",
    text: `
      select
        msg.id as id,
        msg.msg_type as msg_type,
        msg.content as content,
        mtd.reply_msg is not null as "metadata._exists",
        mtd.last_edit is not null as "metadata.updated_before",
        mtd.user_feedback as "metadata.user_feedback"
      from chat_message msg
      left outer join chat_reply_metadata mtd
        on msg.id = mtd.reply_msg
      where session = $1 and old_regenerated = false and ($3::text is null or id < $3::text)
      order by id desc
      limit $2;`,
    values: [opts.session_id, opts.limit, opts.until],
  });
  for (let i = 0; i < rows.length; i++) {
    rows[i] = nestProperties(rows[i]);
    let row = rows[i];
    row.msg_type = msgTypeToStr(row.msg_type);
    row.client_tag = await client_tags.ulidToTag(row.id);
    if (row.metadata) {
      if (!row.metadata._exists) {
        delete row.metadata;
      } else {
        delete row.metadata._exists;
      }
    }
  }
  return rows as FetchedChatMessage[];
}

interface NewChatMessage {
  session_id: string;
  msg_type: MsgType;
  content: string;
  generation_model?: string;
  nb_tokens?: number;
  supress_generation?: boolean;
}

export async function addChatMessage(message: NewChatMessage, db_client: DBClient): Promise<string> {
  if (message.generation_model && message.nb_tokens === undefined) {
    message.nb_tokens = await countTokens(message.generation_model, message.content);
  }
  let { rows: [{ id }] } = await db_client.query({
    text: "insert into chat_message (session, msg_type, content, generation_model, nb_tokens) values ($1, $2, $3, $4, $5) returning id;",
    values: [message.session_id, message.msg_type, message.content, message.generation_model, message.nb_tokens]
  });
  mq.queue.emit(message.session_id, message);
  if (message.msg_type == MsgType.User && !message.supress_generation) {
    // Start off a background task to generate a response. Don't pass it the db
    // instance because we only own it in this function.
    generateResponseFor(message);
  }
  return id;
}

export async function generateResponseFor(message: NewChatMessage, db_client?: DBClient): Promise<void> {
  if (!db_client) {
    return await withDBClient(db => generateResponseFor(message, db));
  }
  throw new Error("Not implemented");
}

// export async function fetchChatMessage(message_id: string, db_client: DBClient): Promise<ChatMessage | null> {
//   let { rows } = await db_client.query({
//     text: "select id, session as session_id, msg_type, content, generation_model, nb_tokens from chat_message where id = $1;",
//     values: [message_id],
//   });
//   if (rows.length == 0) {
//     return null;
//   }
//   return rows[0] as ChatMessage;
// }

export async function fetchChatSession(session_id: string, db: DBClient): Promise<object | null> {
  let { rows } = await db.query({
    text: "select true as exists from chat_session where session_id = $1;",
    values: [session_id],
  });
  if (rows.length == 0) {
    return null;
  }
  return rows[0];
}

export async function newChatSssion(db?: DBClient): Promise<NewChatSessionResult> {
  if (!db) {
    return await withDBClient(db => newChatSssion(db));
  }
  const config = (await getConfigStore()).config;
  const [token_str, token_buf] = await generateToken();
  const res = await db.query({
    text: "insert into chat_session (session_token) values ($1) returning session_id;",
    values: [token_buf],
  });
  let session_id = res.rows[0].session_id;
  let init_messages = config.init_messages;
  for (let [msg_type, content] of init_messages) {
    await addChatMessage({
      session_id, msg_type, content, generation_model: config.generation_model, supress_generation: true,
    }, db);
  }
  return {
    session_id, chat_token: token_str,
  }
}
