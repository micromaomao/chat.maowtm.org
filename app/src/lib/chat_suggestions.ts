import * as mq from "db/mq";
import { ChatSessionEvent, ChatSessionEventType } from "db/mq";
import { Client as DBClient, withDBClient } from "db/index";

export async function fetchSuggestions(msg_id: string, db?: DBClient): Promise<string[]> {
  if (!db) {
    return await withDBClient(db => fetchSuggestions(msg_id, db));
  }

  let res = await db.query({
    text: "select suggestion from chat_suggestion where reply_msg = $1;",
    values: [msg_id]
  });
  return res.rows.map(r => r.suggestion);
}

export interface NewChatSuggestionEvent extends ChatSessionEvent {
  _event: ChatSessionEventType.NewSuggestions;
  reply_msg: string;
  suggestions: string[];
}

export async function setMessageSuggestions(reply_msg_id: string, suggestions: string[], db: DBClient): Promise<NewChatSuggestionEvent> {
  // Cannot insert multiple commands into a prepared statement (even without
  // statement name)
  await db.query("begin transaction isolation level serializable");
  let sess_id;
  try {
    await db.query({
      text: "delete from chat_suggestion where reply_msg = $1",
      values: [reply_msg_id]
    });
    await db.query({
      name: "chat_suggestions.ts#setMessageSuggestions#insert",
      text: `
        insert into chat_suggestion (reply_msg, suggestion)
          select
            unnest(array_fill($1::text, array[array_length($2::text[], 1)])),
            unnest($2::text[])`,
      values: [reply_msg_id, suggestions]
    });
    let res = await db.query({
      text: "select session from chat_message where id = $1",
      values: [reply_msg_id]
    });
    sess_id = res.rows[0].session;
    await db.query("commit");
  } finally {
    await db.query("rollback");
  }
  let evt: NewChatSuggestionEvent = {
    _event: ChatSessionEventType.NewSuggestions,
    reply_msg: reply_msg_id,
    suggestions
  };
  mq.queue.emit(sess_id, evt);
  return evt;
}

interface ExtractSuggestionsRes {
  suggestions: string[];
  message_without_suggestions: string;
}

export function extractSuggestions(message: string): ExtractSuggestionsRes {
  let suggestions_list_regex = /(?<=^ *|\n *|[.!?] +|[\uff01\uff1f\u3002] *)suggestion \d+:[\n ]*([^\n]+)(?=$|\n)/igd;
  let suggestions = [];
  let message_without_suggestions = message;
  let match: RegExpExecArray;
  while ((match = suggestions_list_regex.exec(message)) !== null) {
    if (suggestions.length == 0) {
      message_without_suggestions = message.substring(0, match.index);
    }
    let m1 = match[1];
    let m2 = m1.match(/([.!?] +|[\uff01\uff1f\u3002] *)suggestion \d+:/id);
    if (m2) {
      suggestions_list_regex.lastIndex = match.indices[1][0] + m2.index;
      m1 = m1.substring(0, m2.indices[1][1]);
    }
    let sugg = m1.trim();
    if (!suggestions.includes(sugg)) {
      suggestions.push(sugg);
    }
  }
  return {
    suggestions,
    message_without_suggestions: message_without_suggestions.trim(),
  };
}
