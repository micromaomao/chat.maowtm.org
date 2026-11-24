import { MsgType } from "db/enums";
import { Client as DBClient, withDBClient } from "db/index";
import getConfigStore from "db/config";
import { LLMBase } from "./llm/base";
import { getCachedMatcher } from "./match_dialogue";
import { extractSuggestions, fetchSuggestions } from "./chat_suggestions";
import type { NewChatMessage } from "./chat";
import { estimateTokens } from "./llm/models";
import { budgetHistory, promptBudget } from "./prompt_budget";

export interface GeneratedReply {
  message: NewChatMessage;
  suggestions: string[];
}

export async function generateReply(session: string, source: string, signal: AbortSignal): Promise<GeneratedReply> {
  const store = await getConfigStore();
  const config = store.config;
  const model = store.generation_model;
  const embeddingModel = store.embedding_model;
  const budget = promptBudget(config.generation_model);
  const placeholder = "<|DIALOGUE_ITEMS|>";
  if (!config.prompt_template.includes(placeholder)) {
    throw new Error("Prompt template must contain <|DIALOGUE_ITEMS|>");
  }

  const prepared = await withDBClient(async db => {
    const { rows } = await db.query(
      `select msg.id, msg.session as session_id, msg.msg_type, msg.content,
        emb.embedding, mtd.matched_dialogue_items::text[] as matched_dialogue_items,
        mtd.matched_item_scores, mtd.best_phrasing::text[] as best_phrasing
       from chat_message msg
       left join chat_message_embedding emb on emb.msg = msg.id and emb.model = $1
       left join chat_reply_metadata mtd on mtd.reply_msg = msg.id
       where msg.session = $2 and not msg.exclude_from_generation and msg.msg_type in (0, 1)
       order by msg.id desc limit $3`,
      [embeddingModel.model_name, session, config.generation_model.history_limit]
    );
    signal.throwIfAborted();
    if (!rows.length || rows[0].id !== source) {
      throw new Error("Generation source is no longer the latest eligible message");
    }
    await ensureMsgRowHasEmbedding(rows[0], embeddingModel, db, signal);
    const baseTokens = estimateTokens(config.prompt_template.replace(placeholder, "")) + 12;
    const available = budget - baseTokens - estimateTokens(rows[0].content) - 12;
    if (available < 0) throw new Error("Latest message and system prompt exceed the safe context budget");
    const matcher = await getCachedMatcher();
    const match = await matcher.matchDialogue(rows, Math.min(config.generation_model.max_sample_tokens, available), signal, db);
    const samples = match.model_sample_input.map(line => typeof line === "string" ? line : model.dialogueToPrompt(line));
    const prompt = config.prompt_template.replace(placeholder, samples.join("\n") || "(no relevant content found)");
    const latestBot = rows.find(row => row.msg_type === MsgType.Bot);
    if (latestBot) {
      const suggestions = await fetchSuggestions(latestBot.id, db);
      const extra = suggestions.map((text, index) => `Suggestion ${index + 1}: ${text}`).join("\n");
      if (extra && estimateTokens(prompt + rows[0].content + latestBot.content + extra) + 36 <= budget) {
        latestBot.content += "\n" + extra;
      }
    }
    return { match, prompt, lines: budgetHistory(prompt, rows, budget) };
  });
  signal.throwIfAborted();
  const completion = await model.chatCompletion({
    instruction_prompt: prepared.prompt,
    chat_history: prepared.lines.map(line => ({ role: line.role, text: line.text })),
  }, { session_id: session }, signal);
  const result = extractSuggestions(completion.text);
  if (!result.message_without_suggestions) throw new Error("Workers AI returned suggestions without a reply");
  return {
    message: {
      session_id: session,
      msg_type: MsgType.Bot,
      content: result.message_without_suggestions,
      generation_model: model.model_name,
      nb_tokens: estimateTokens(result.message_without_suggestions),
      supress_generation: true,
      reply_metadata: {
        ...prepared.match,
        model_chat_inputs: prepared.lines.map(line => line.msg_id),
      },
    },
    suggestions: result.suggestions.slice(0, 3),
  };
}

export async function ensureMsgRowHasEmbedding(row: any, model: LLMBase, db: DBClient, signal: AbortSignal): Promise<void> {
  if (row.embedding != null) return;
  const result = await model.getEmbeddings(row.content, { session_id: row.session_id }, signal);
  signal.throwIfAborted();
  await db.query(
    `insert into chat_message_embedding (msg, model, embedding, nb_tokens)
     values ($1, $2, $3::jsonb, $4) on conflict (msg, model) do nothing`,
    [row.id, model.model_name, JSON.stringify(result.embedding), result.total_tokens]
  );
  row.embedding = result.embedding;
}

export async function generateSuggestions(session: string, source: string, reply: string, signal: AbortSignal): Promise<string[]> {
  const store = await getConfigStore();
  const rows = await withDBClient(async db => (await db.query(
    "select id, msg_type, content from chat_message where id = any($1) order by id desc",
    [[source, reply]]
  )).rows);
  const prompt = "Write up to three short follow-up messages that the user could send next. Output only one per line, formatted as Suggestion 1: ..., Suggestion 2: ..., Suggestion 3: ...";
  const lines = budgetHistory(prompt, rows, promptBudget(store.config.generation_model));
  const completion = await store.generation_model.chatCompletion({
    instruction_prompt: prompt,
    chat_history: [
      ...lines.map(line => ({ role: line.role, text: line.text })),
      { role: "user", text: "Suggest follow-up messages now." },
    ],
  }, { session_id: session }, signal);
  const suggestions = extractSuggestions(completion.text).suggestions.slice(0, 3);
  if (!suggestions.length) throw new Error("Workers AI returned no follow-up suggestions");
  return suggestions;
}
