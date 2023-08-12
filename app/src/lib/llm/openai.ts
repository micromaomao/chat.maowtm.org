import { CheckModerationResult, LLMBase, LLMCOmpletionOutput, LLMChatCompletionInput, LLMEmbeddingOutput, ModerationProvider, TelemetryInfo } from "./base";
import { input2log } from "lib/utils";

const API_BASE = process.env.OPENAI_API_BASE;
const API_KEY = process.env.OPENAI_API_KEY;

export const KnownEmbeddingModels = [
  "text-embedding-ada-002",
  "text-similarity-davinci-001",
];

export class OpenAIError extends Error {
  fetch_err: Error | null = null;
  res_status: number | null = null;
  res_status_text: string | null = null;
  error_type: string | null = null;
  error_message: string | null = null;

  constructor() {
    super();
  }

  static fromFetchError(err: Error): OpenAIError {
    const e = new OpenAIError();
    e.fetch_err = err;
    return e;
  }

  override toString(): string {
    if (this.fetch_err) {
      return `Unable to call OpenAI API: ${this.fetch_err}`;
    }
    if (this.error_message) {
      return `OpenAI API Error: ${this.error_message}`;
    }
    if (this.res_status) {
      return `OpenAI API Error: HTTP ${this.res_status} ${this.res_status_text}`;
    }
    if (this.message) {
      return `OpenAI API Error: ${this.message}`;
    }
    return "Unknown OpenAI API Error";
  }
}

async function parseResponse(res: Response): Promise<any> {
  const err = new OpenAIError();
  let has_error = false;
  let res_body = null;
  if (!res.ok) {
    err.res_status = res.status;
    err.res_status_text = res.statusText;
    has_error = true;
  }
  if (res.headers.get("Content-Type")?.startsWith("application/json")) {
    res_body = await res.json();
    if (res_body.error) {
      err.error_type = res_body.error.type;
      err.error_message = res_body.error.message;
      has_error = true;
    }
  } else if (res.ok) {
    err.message = `Unexpected response type ${res.headers.get("Content-Type")}`;
    has_error = true;
  }
  if (has_error) {
    throw err;
  } else {
    return res_body;
  }
}

export class OpenAIBase extends LLMBase {
  constructor(model_name: string, config: object) {
    super(model_name, config);
  }

  async countTokens(text: string, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<number> {
    console.log(`OpenAI GET _/count-tokens { model: ${this.model_name}, input: ${input2log(text)} }`);
    const res = await parseResponse(await fetch(new URL(`_/count-tokens?model=${encodeURIComponent(this.model_name)}`, API_BASE), {
      body: text,
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "Authorization": "Bearer " + API_KEY,
        "Accept": "application/json",
      },
      signal: abortSignal,
    }));
    return res.count;
  }

}

export interface OpenAIChatCompletionConfig {
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens: number;

  /**
   * Defaults to true
   */
  use_moderation?: boolean;
}

export class OpenAIChatCompletionModel extends OpenAIBase {
  static supportsChatCompletion = true;
  static supportsEmbedding = false;

  config: OpenAIChatCompletionConfig;
  constructor(model_name: string, config: OpenAIChatCompletionConfig) {
    super(model_name, config);
    if (typeof this.config.use_moderation == "undefined") {
      this.config.use_moderation = true;
    }
  }

  get shouldUseModeration(): boolean {
    return this.config.use_moderation;
  }

  async chatCompletion(input: LLMChatCompletionInput, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<LLMCOmpletionOutput> {
    console.log(`OpenAI POST chat/completions { model: ${this.model_name}, messages: (len = ${input.chat_history.length}) }`);
    const messages = [{
      role: "system",
      content: input.instruction_prompt,
    }];
    for (let msg of input.chat_history) {
      messages.push({
        role: msg.role == "user" ? "user" : "assistant",
        content: msg.text,
      });
    }
    const res = await parseResponse(await fetch(new URL("chat/completions", API_BASE), {
      body: JSON.stringify({
        temperature: this.config.temperature,
        top_p: this.config.top_p,
        presence_penalty: this.config.presence_penalty,
        frequency_penalty: this.config.frequency_penalty,
        max_tokens: this.config.max_tokens,

        model: this.model_name,
        user: telemetry.session_id || undefined,
        messages
      }),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + API_KEY,
        "Accept": "application/json",
      },
      signal: abortSignal,
    }));
    const message = res.choices[0].message;
    return {
      text: message.content,
      completion_tokens: res.usage.completion_tokens,
      total_tokens: res.usage.total_tokens,
    }
  }

  async checkModeration(text: string, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<CheckModerationResult> {
    console.log(`OpenAI POST moderations { input: ${input2log(text)} }`);
    const res = await parseResponse(await fetch(new URL("moderations", API_BASE), {
      body: JSON.stringify({
        input: text,
      }),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + API_KEY,
        "Accept": "application/json",
      },
      signal: abortSignal,
    }));
    if (res.results.length != 1) {
      console.warn(`Unexpected result length ${res.results.length} returned from OpenAI moderation API`);
    }
    for (let result of res.results) {
      if (result.flagged) {
        let res: CheckModerationResult = {
          flagged: true,
          flagged_categories: [],
          moderation_provider: ModerationProvider.OpenAI,
        };
        for (let [cat, flagged] of Object.entries(result.categories)) {
          if (flagged) {
            res.flagged_categories.push(cat);
          }
        }
        console.info(`OpenAI Moderation flagged input ${input2log(text)}:`, res.flagged_categories);
        return res;
      }
    }
    return { flagged: false };
  }
}

export class OpenAIEmbeddingModel extends OpenAIBase {
  static supportsChatCompletion = false;
  static supportsEmbedding = true;

  config: {};
  constructor(model_name: string) {
    super(model_name, {});
  }

  async getEmbeddings(text: string, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<LLMEmbeddingOutput> {
    console.log(`OpenAI GET embeddings { model: ${this.model_name}, input: ${input2log(text)} }`);
    const res = await parseResponse(await fetch(new URL("embeddings", API_BASE), {
      body: JSON.stringify({
        model: this.model_name,
        user: telemetry.session_id || undefined,
        input: text,
      }),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + API_KEY,
        "Accept": "application/json",
      },
      signal: abortSignal,
    }));
    const embedding = res.data[0].embedding;
    return {
      embedding,
      total_tokens: res.usage.total_tokens,
    };
  }
}
