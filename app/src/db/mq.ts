import type { Client } from "./index";
import { runtime } from "../runtime";

export enum ChatSessionEventType {
  NewChatMessage = "new_chat_message",
  NewSuggestions = "new_suggestions",
  MessageEdited = "message_edited",
  ExcludeSingleMessage = "exclude_single_message",
  Reset = "reset",
}

export interface ChatSessionEvent {
  _event: ChatSessionEventType;
  id?: string;
  reply_msg?: string;
  suggestions?: string[];
}

export interface SessionEvent {
  id: string;
  session_id: string;
  payload: ChatSessionEvent;
}

export async function publish(session_id: string, payload: ChatSessionEvent, db: Client): Promise<void> {
  const { rows } = await db.query(
    "insert into chat_session_event (session, payload) values ($1, $2) returning id::text",
    [session_id, JSON.stringify(payload)]
  );
  runtime().events.push({ id: rows[0].id, session_id, payload });
}
