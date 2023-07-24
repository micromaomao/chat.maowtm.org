import { MsgType } from "../../db/enums";

export enum MsgTypeStr {
  Bot = "bot",
  User = "user",
}

export function msgTypeToStr(msg_type: MsgType): MsgTypeStr {
  switch (msg_type) {
    case MsgType.Bot:
      return MsgTypeStr.Bot;
    case MsgType.User:
      return MsgTypeStr.User;
    default:
      throw new Error(`Unknown message type ${msg_type}`);
  }
}

export interface FetchedChatMessage {
  id: string;
  msg_type: MsgTypeStr;
  content: string;
  metadata: FetchedChatMessageMetadata;
  client_tag?: string;
}

export interface FetchedChatMessageMetadata {
  updated_before?: boolean;
  user_feedback: number;
}

export interface ChatSuggestions {
  suggestions: string[];
  reply_msg: string;
}

export interface NewChatSessionResult {
  session_id: string;
  chat_token: string;
}
