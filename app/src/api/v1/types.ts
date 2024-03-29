import { MsgType } from "db/enums";

export enum MsgTypeStr {
  Bot = "bot",
  User = "user",
  Error = "error",
}

export function msgTypeToStr(msg_type: MsgType): MsgTypeStr {
  switch (msg_type) {
    case MsgType.Bot:
      return MsgTypeStr.Bot;
    case MsgType.User:
      return MsgTypeStr.User;
    case MsgType.Error:
      return MsgTypeStr.Error;
    default:
      throw new Error(`Unknown message type ${msg_type}`);
  }
}

export interface FetchedChatMessage {
  id: string;
  msg_type: MsgTypeStr;
  content: string;
  metadata: FetchedChatMessageMetadata;
  exclude_from_generation: boolean;
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

export interface DialoguePathElement {
  dialogue_id: string;
  canonical_phrasing_text: string;
}

export type DialoguePath = DialoguePathElement[];

export interface DialogueItemInput {
  /**
   * First element is the canonical phrasing.
   */
  phrasings: string[];
  reply: string;
}

export interface FetchedDialogueItemData extends DialogueItemInput {
  path: DialoguePath;
  group_id: string;
}

export type InspectLastEditResult = {
  edited: true;
  updated_dialogue_item: FetchedDialogueItemData;
} | {
  edited: false;
  prev_reply_path: DialoguePath | null;
}
