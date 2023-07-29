import * as cfg from "db/config";
import { LLMBase } from "./base";
import { OpenAIChatCompletionModel, OpenAIEmbeddingModel } from "./openai";
import { ReplicateLLAMA } from "./replicate";

export function embeddingModelFromConfig(config: cfg.Model): LLMBase {
  switch (config.type) {
    case "openai":
      return new OpenAIEmbeddingModel(config.name);
    default:
      throw new Error(`Unknown embedding model type: ${config.type}`);
  }
}

export function chatCompletionModelFromConfig(config: cfg.GenerationModel): LLMBase {
  switch (config.type) {
    case "openai-chat":
      return new OpenAIChatCompletionModel(config.name, Object.assign({}, {
        max_tokens: config.reserve_token_count
      }, config.config));
    case "replicate-llama-chat":
      return new ReplicateLLAMA(config.name, Object.assign({}, {
        max_new_tokens: config.reserve_token_count,
        model_id: config.name,
      }, config.config));
    default:
      throw new Error(`Unknown chat model type: ${config.type}`);
  }
}
