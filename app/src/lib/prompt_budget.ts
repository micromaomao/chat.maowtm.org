import type { GenerationModel } from "../db/config";
import { MsgType } from "../db/enums";
import { estimateTokens } from "./llm/models";

export function promptBudget(model: GenerationModel): number {
  return Math.floor(model.total_token_limit * 0.75) - model.reserve_token_count;
}

interface HistoryRow {
  id: string;
  content: string;
  msg_type: MsgType;
}

export function budgetHistory(prompt: string, newestFirst: HistoryRow[], budget: number) {
  let tokens = estimateTokens(prompt) + 12;
  const lines: { msg_id: string; role: "user" | "bot"; text: string }[] = [];
  for (const row of newestFirst) {
    const next = tokens + estimateTokens(row.content) + 12;
    if (next > budget) {
      if (!lines.length) throw new Error("Latest message exceeds the safe context budget");
      break;
    }
    tokens = next;
    lines.push({ msg_id: row.id, role: row.msg_type === MsgType.User ? "user" : "bot", text: row.content });
  }
  if (lines.length > 1 && lines[lines.length - 1].role === "bot") lines.pop();
  return lines.reverse();
}
