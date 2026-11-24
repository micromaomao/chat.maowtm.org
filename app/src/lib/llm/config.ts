import type { GenerationModel, Model } from "db/config";
import { WorkersAIModel } from "./workers_ai";
import { runtime } from "../../runtime";

function checkModel(config: Model) {
  if (config.type !== "workers-ai" || !config.name.startsWith("@cf/")) {
    throw new Error("Only Cloudflare Workers AI models are supported. Run reembed --activate to migrate the configuration.");
  }
}

export function embeddingModelFromConfig(config: Model): WorkersAIModel {
  checkModel(config);
  return new WorkersAIModel(runtime().env.AI, config.name, config.config);
}

export function chatCompletionModelFromConfig(config: GenerationModel): WorkersAIModel {
  checkModel(config);
  return new WorkersAIModel(runtime().env.AI, config.name, {
    ...config.config,
    max_tokens: config.reserve_token_count,
  });
}
