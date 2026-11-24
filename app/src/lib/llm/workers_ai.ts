import type { WorkersAI } from "../../env";
import { LLMBase, LLMChatCompletionInput, LLMCOmpletionOutput, LLMEmbeddingOutput, TelemetryInfo } from "./base";
import { estimateTokens } from "./models";
import { norm } from "../vectools";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEmbeddings(value: unknown, count: number): number[][] {
  if (!isRecord(value) || !Array.isArray(value.data) || value.data.length !== count) {
    throw new Error("Workers AI returned an invalid embedding batch");
  }
  const vectors = value.data.map((vector: unknown) => {
    if (!Array.isArray(vector) || !vector.length || !vector.every(x => typeof x === "number" && Number.isFinite(x))) {
      throw new Error("Workers AI returned an invalid embedding vector");
    }
    const length = norm(vector);
    if (!Number.isFinite(length) || length === 0) {
      throw new Error("Workers AI returned a zero or invalid embedding");
    }
    return vector.map(x => x / length);
  });
  if (vectors.some(vector => vector.length !== vectors[0].length)) {
    throw new Error("Workers AI returned inconsistent embedding dimensions");
  }
  return vectors;
}

export class WorkersAIModel extends LLMBase {
  constructor(private ai: WorkersAI, name: string, config: object = {}) {
    super(name, config);
  }

  async countTokens(text: string, _telemetry: TelemetryInfo, signal?: AbortSignal): Promise<number> {
    signal?.throwIfAborted();
    return estimateTokens(text);
  }

  async chatCompletion(input: LLMChatCompletionInput, _telemetry: TelemetryInfo, signal?: AbortSignal): Promise<LLMCOmpletionOutput> {
    signal?.throwIfAborted();
    const result = await this.ai.run(this.model_name, {
      ...this.config,
      messages: [
        { role: "system", content: input.instruction_prompt },
        ...input.chat_history.map(line => ({
          role: line.role === "bot" ? "assistant" : "user",
          content: line.text,
        })),
      ],
      stream: false,
    });
    signal?.throwIfAborted();
    if (!isRecord(result) || typeof result.response !== "string" || !result.response.trim()) {
      throw new Error("Workers AI returned no chat response");
    }
    return {
      text: result.response,
      completion_tokens: estimateTokens(result.response),
      total_tokens: estimateTokens(input.instruction_prompt + input.chat_history.map(x => x.text).join("\n") + result.response),
    };
  }

  async getEmbeddings(text: string, _telemetry: TelemetryInfo, signal?: AbortSignal): Promise<LLMEmbeddingOutput> {
    const embeddings = await this.getEmbeddingsBatch([text], signal);
    return { embedding: embeddings[0], total_tokens: estimateTokens(text) };
  }

  async getEmbeddingsBatch(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    signal?.throwIfAborted();
    const result = await this.ai.run(this.model_name, { text: texts });
    signal?.throwIfAborted();
    return parseEmbeddings(result, texts.length);
  }
}
