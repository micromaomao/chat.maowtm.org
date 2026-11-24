import type { Config } from "./config";
import { MsgType } from "./enums";
import { DEFAULT_CHAT_MODEL, DEFAULT_EMBEDDING_MODEL } from "../lib/llm/models";

export function defaultConfig(prompt_template: string): Config {
  return {
    embedding_model: { type: "workers-ai", name: DEFAULT_EMBEDDING_MODEL, config: {} },
    generation_model: {
      type: "workers-ai",
      name: DEFAULT_CHAT_MODEL,
      config: { temperature: 0.5, top_p: 1 },
      history_limit: 50,
      total_token_limit: 24000,
      max_sample_tokens: 4000,
      reserve_token_count: 1024,
    },
    init_messages: [[MsgType.Bot, "Hi, nice to meet you!"]],
    prompt_template,
    allow_new_session: true,
    allow_new_chat: true,
    global_rate_limit: [
      { limit: 30, reset_period: 60 },
      { limit: 60, reset_period: 600 },
    ],
  };
}
