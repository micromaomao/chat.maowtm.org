import getConfigStore from "db/config";
import { Client as DBClient, withDBClient } from "db/index";
import * as mq from "db/mq";
import { ChatSessionEvent, ChatSessionEventType } from "db/mq";
import { FetchedChatMessage, NewChatSessionResult, msgTypeToStr } from "../api/v1/types"
import { MsgType } from "db/enums";
import client_tags from "db/client_tag";
import { nestProperties } from "./utils";
import { generateToken } from "./secure_token/nodejs";
import { cancelGenerationTask, startBackgroundGenerateResponseTask } from "./gen_response";
import { MatchDialogueResult } from "./match_dialogue";
import { APIError, GlobalChatRateLimitExceeded } from "../api/basics";
import { RateLimit } from "db/rate_limit";
import { response, type Response } from "express";

export interface FetchLastChatMessagesOptions {
  session_id: string;
  until?: string;
  limit: number;
  db_client?: DBClient;
}

const _fetchMessageCommonSelectPart = `
  select
    msg.id as id,
    msg.msg_type as msg_type,
    msg.content as content,
    mtd.reply_msg is not null as "metadata._exists",
    mtd.last_edit is not null as "metadata.updated_before",
    mtd.user_feedback as "metadata.user_feedback",
    msg.exclude_from_generation as exclude_from_generation
  from chat_message msg
  left outer join chat_reply_metadata mtd
    on msg.id = mtd.reply_msg
`;

async function _processFetchedMessageRow(row: any): Promise<any> {
  row = nestProperties(row);
  row.msg_type = msgTypeToStr(row.msg_type);
  row.client_tag = await client_tags.ulidToTag(row.id);
  if (row.metadata) {
    if (!row.metadata._exists) {
      delete row.metadata;
    } else {
      delete row.metadata._exists;
    }
  }
  return row;
}

export async function fetchLastChatMessages(opts: FetchLastChatMessagesOptions): Promise<FetchedChatMessage[]> {
  if (!opts.db_client) {
    return await withDBClient(db => fetchLastChatMessages({ ...opts, db_client: db }));
  }
  let db = opts.db_client;
  let { rows }: { rows: any[] } = await db.query({
    name: "chats.ts#fetchLastChatMessages",
    text: `
      ${_fetchMessageCommonSelectPart}
      where msg.session = $1 and ($2::text is null or msg.id < $2::text)
      order by id desc
      limit $3;`,
    values: [opts.session_id, opts.until, opts.limit],
  });
  for (let i = 0; i < rows.length; i++) {
    rows[i] = await _processFetchedMessageRow(rows[i]);
  }
  rows.reverse();
  return rows as FetchedChatMessage[];
}

export async function fetchSingleMessage(message_id: string, db?: DBClient): Promise<FetchedChatMessage> {
  if (!db) {
    return await withDBClient(db => fetchSingleMessage(message_id, db));
  }
  let { rows }: { rows: any[] } = await db.query({
    name: "chats.ts#fetchSingleMessage",
    text: `
      ${_fetchMessageCommonSelectPart}
      where msg.id = $1`,
    values: [message_id],
  });
  if (rows.length == 0) {
    throw new ChatMessageNotFoundError(message_id);
  }
  if (rows.length > 1) {
    throw new Error("Assertion failed: row.length > 1");
  }
  let res = await _processFetchedMessageRow(rows[0]);
  return res as FetchedChatMessage;
}

export interface NewChatMessage {
  session_id: string;
  msg_type: MsgType;
  content: string;
  generation_model?: string;
  nb_tokens?: number;
  supress_generation?: boolean;
  reply_metadata?: NewChatMessageReplyMetadata;
  client_tag?: string;
}

export interface NewChatMessageEvent extends NewChatMessage, ChatSessionEvent {
  _event: ChatSessionEventType.NewChatMessage;
  id: string;
}

export interface NewChatMessageReplyMetadata extends MatchDialogueResult {
  model_chat_inputs: string[];
}

export async function userNewChatPreCheck(session_id: string, db: DBClient, http_res: Response): Promise<void> {
  let conf_store = await getConfigStore();
  let conf = conf_store.config;
  if (!conf.allow_new_chat) {
    throw new APIError(503, "The server has disabled new chat messages at this time.");
  }
  await conf_store.enforceGlobalRateLimit(http_res, db);
}

export async function addChatMessage(message: NewChatMessage, db_client?: DBClient): Promise<NewChatMessageEvent> {
  if (!db_client) {
    return await withDBClient(db => addChatMessage(message, db));
  }
  let conf = await getConfigStore();
  if (message.generation_model && message.nb_tokens === undefined && message.generation_model == conf.generation_model.model_name) {
    message.nb_tokens = await conf.generation_model.countTokens(message.content, { session_id: message.session_id });
  }
  if (message.msg_type != MsgType.Bot && message.reply_metadata) {
    throw new Error("Invalid message - non-bot messages cannot have reply metadata");
  }
  let { rows: [{ id }] } = await db_client.query({
    text: "insert into chat_message (session, msg_type, content, generation_model, nb_tokens) values ($1, $2, $3, $4, $5) returning id;",
    values: [message.session_id, message.msg_type, message.content, message.generation_model, message.nb_tokens]
  });
  let mtd = message.reply_metadata;
  if (mtd) {
    await db_client.query({
      text: `
        insert into chat_reply_metadata (
          reply_msg,
          matched_dialogue_items,
          matched_item_scores,
          best_phrasing,
          model_chat_inputs,
          direct_result
        ) values ($1, $2, $3, $4, $5, $6);`,
      values: [
        id,
        mtd.item_matches.map(x => x.item.dialogue_item_id),
        mtd.item_matches.map(x => x.score),
        mtd.item_matches.map(x => x.best_phrasing.phrasing_id),
        mtd.model_chat_inputs,
        mtd.direct_result
      ]
    });
  }
  let msg_evt: NewChatMessageEvent = {
    _event: ChatSessionEventType.NewChatMessage,
    ...message,
    id
  };
  mq.queue.emit(message.session_id, msg_evt);
  if (message.msg_type == MsgType.User && !message.supress_generation) {
    await startBackgroundGenerateResponseTask(msg_evt);
  }
  return msg_evt;
}

export interface FetchedChatSession {
  session_id: string;
}

export async function fetchChatSession(session_id: string, db: DBClient): Promise<FetchedChatSession | null> {
  let { rows } = await db.query({
    text: "select session_id as exists from chat_session where session_id = $1;",
    values: [session_id],
  });
  if (rows.length == 0) {
    return null;
  }
  return rows[0] as FetchedChatSession;
}

export async function userNewSessionPreCheck(db?: DBClient): Promise<void> {
  let conf = (await getConfigStore()).config;
  if (!conf.allow_new_session) {
    throw new APIError(503, "New sessions are not allowed at this time");
  }
}

export async function newChatSssion(db?: DBClient): Promise<NewChatSessionResult> {
  if (!db) {
    return await withDBClient(db => newChatSssion(db));
  }
  const conf_store = await getConfigStore();
  const [token_str, token_buf] = await generateToken();
  const res = await db.query({
    text: "insert into chat_session (session_token) values ($1) returning session_id;",
    values: [token_buf],
  });
  let session_id = res.rows[0].session_id;
  let init_messages = conf_store.config.init_messages;
  for (let [msg_type, content] of init_messages) {
    await addChatMessage({
      session_id, msg_type, content, generation_model: conf_store.generation_model.model_name, supress_generation: true,
    }, db);
  }
  return {
    session_id, chat_token: token_str,
  }
}

export class ChatMessageNotFoundError extends APIError {
  constructor(message_id: string) {
    super(404, `Chat message ${message_id} not found`);
  }
}

export async function findChatMessageSession(message_id: string, db: DBClient): Promise<string> {
  let { rows } = await db.query({
    text: "select session from chat_message where id = $1",
    values: [message_id],
  });
  if (rows.length == 0) {
    throw new ChatMessageNotFoundError(message_id);
  }
  return rows[0].session;
}

export async function rollbackChat(session_id: string, first_message_id_to_exclude: string, db: DBClient): Promise<void> {
  cancelGenerationTask(session_id);
  await db.query({
    text: `
      update chat_message set exclude_from_generation = true
        where session = $1 and id >= $2 and
          (msg_type = ${MsgType.User} or msg_type = ${MsgType.Bot})`,
    values: [session_id, first_message_id_to_exclude],
  });
}

export interface ExcludeSingleMessageEvent extends ChatSessionEvent {
  _event: ChatSessionEventType.ExcludeSingleMessage;
  id: string;
}

export async function excludeSingleMessage(message_id: string, db: DBClient): Promise<ExcludeSingleMessageEvent> {
  let { rows } = await db.query({
    text: "update chat_message set exclude_from_generation = true where id = $1 returning session;",
    values: [message_id],
  });
  if (rows.length == 0) {
    throw new ChatMessageNotFoundError(message_id);
  }
  let evt: ExcludeSingleMessageEvent = {
    _event: ChatSessionEventType.ExcludeSingleMessage,
    id: message_id,
  };
  mq.queue.emit(rows[0].session, evt);
  return evt;
}
