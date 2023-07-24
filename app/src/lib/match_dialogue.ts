import { MsgType } from "db/enums";
import { Client as DBClient } from "db/index";

export interface MatchDialogueChatHistoryEntry {
  id: string;
  msg_type: MsgType;
  content: string;
  embedding: number[];
}

export interface MatchDialogueResult {
  matched_phrasings: string[];
  match_scores: number[];
  best_match_dialogue: string | null;
  direct_result: boolean;
}

/**
 * @param message_history The chat history to match against, in reverse order (most recent first)
 */
export async function matchDialogue(message_history: MatchDialogueChatHistoryEntry[], abort: AbortSignal, db_client?: DBClient): Promise<MatchDialogueResult> {
  // TODO: Implement
  return {
    matched_phrasings: [],
    match_scores: [],
    best_match_dialogue: null,
    direct_result: false,
  }
}
