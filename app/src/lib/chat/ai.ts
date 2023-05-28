const API_BASE = process.env.OPENAI_API_BASE;
const API_KEY = process.env.OPENAI_API_KEY;

export interface EmbeddingParams {
  model: string;
}

export const KnownEmbeddingModels = [
  "text-embedding-ada-002",
  "text-similarity-davinci-001",
]

export class OpenAIError extends Error {
  fetch_err: Error | null = null;
  res_status: number | null = null;
  res_status_text: string | null = null;
  error_type: string | null = null;
  error_message: string | null = null;

  constructor() {
    super()
  }

  static fromFetchError(err: Error): OpenAIError {
    let e = new OpenAIError();
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
    return "Unknown OpenAI API Error"
  }
}

async function parseResponse(res: Response): Promise<any> {
  let err = new OpenAIError();
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

function input2log(input: string): string {
  if (input.length > 100) {
    input = input.slice(0, 100) + "...";
  }
  return JSON.stringify(input);
}

interface ResponseWithTokenCount<T> {
  result: T;
  token_count: number;
}

export async function getEmbedding(params: EmbeddingParams, input: string): Promise<ResponseWithTokenCount<Float32Array>> {
  console.log(`OpenAI GET embeddings { model: ${params.model}, input: ${input2log(input)} }`)
  let res = await parseResponse(await fetch(API_BASE + "embeddings", {
    body: JSON.stringify({
      model: params.model,
      input,
    }),
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY,
      "Accept": "application/json",
    },
  }));
  let embeddings = res.data[0].embedding;
  let arr = new Float32Array(embeddings);
  return {
    result: arr,
    token_count: res.usage.total_tokens,
  }
}
