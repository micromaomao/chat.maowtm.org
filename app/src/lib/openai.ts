import { input2log } from "lib/utils";

const API_BASE = process.env.OPENAI_API_BASE;
const API_KEY = process.env.OPENAI_API_KEY;

export interface EmbeddingParams {
  model: string;
}

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

interface ResponseWithTokenCount<T> {
  result: T;
  token_count: number;
}

export async function getEmbedding(params: EmbeddingParams, input: string, abortSignal?: AbortSignal): Promise<ResponseWithTokenCount<number[]>> {
  console.log(`OpenAI GET embeddings { model: ${params.model}, input: ${input2log(input)} }`);
  const res = await parseResponse(await fetch(new URL("embeddings", API_BASE), {
    body: JSON.stringify({
      model: params.model,
      input,
    }),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY,
      "Accept": "application/json",
    },
    signal: abortSignal,
  }));
  const embeddings = res.data[0].embedding;
  return {
    result: embeddings,
    token_count: res.usage.total_tokens,
  };
}

export async function countTokens(model: string, input: string): Promise<number> {
  console.log(`OpenAI GET _/count-tokens { model: ${model}, input: ${input2log(input)} }`);
  const res = await parseResponse(await fetch(new URL(`_/count-tokens?model=${encodeURIComponent(model)}`, API_BASE), {
    body: input,
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "Authorization": "Bearer " + API_KEY,
      "Accept": "application/json",
    },
  }));
  return res.count;
}

export type OpenAIChatRole = "system" | "user" | "assistant";

export interface ChatCompletionParams {
  model: string;
  messages: {
    role: OpenAIChatRole;
    name?: string;
    content: string;
  }[];
  temperature?: number;
  top_p?: number;
  max_tokens: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface ChatCompletionResponse {
  role: OpenAIChatRole;
  content: string;
  completion_tokens: number;
  total_tokens: number;
};

export async function getChatCompletion(params: ChatCompletionParams, abortSignal?: AbortSignal): Promise<ChatCompletionResponse> {
  console.log(`OpenAI POST chat/completions { model: ${params.model}, messages: (len = ${params.messages.length}) }`);
  const res = await parseResponse(await fetch(new URL("chat/completions", API_BASE), {
    body: JSON.stringify(params),
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
    role: message.role,
    content: message.content,
    completion_tokens: res.usage.completion_tokens,
    total_tokens: res.usage.total_tokens,
  }
}
