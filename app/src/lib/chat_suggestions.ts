import * as mq from "db/messages";
import { ChatSessionEvent, ChatSessionEventType } from "db/messages";
import { Client as DBClient } from "db/index";

export interface NewChatSuggestionEvent extends ChatSessionEvent {
  _event: ChatSessionEventType.NewSuggestions;
  reply_msg: string;
  suggestions: string[];
}

export async function setMessageSuggestions(reply_msg_id: string, suggestions: string[], db: DBClient): Promise<NewChatSuggestionEvent> {
  let res = await db.query({
    name: "chat_suggestions.ts#setMessageSuggestions",
    text: `
      delete from chat_suggestion where reply_msg = $1;
      insert into chat_suggestion (reply_msg, suggestion)
        select
          unnest(array_fill($1, array[array_length($2, 1)])),
          unnest($2);
      select session from chat_message where id = $1`,
    values: [reply_msg_id, suggestions]
  });
  let sess_id = res.rows[0].session;
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
  let suggestions_list_regex = /^suggestion( \d+)?:[^\n]+$/igm;
  let matches = message.match(suggestions_list_regex);
  let message_without_suggestions = message.replace(suggestions_list_regex, "").trim();
  let suggestions = matches ? matches.map(m => m.replace(/^suggestion( \d+)?:/i, "").trim()) : [];
  return {
    suggestions,
    message_without_suggestions
  };
}
