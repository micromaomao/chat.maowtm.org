export const DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const DEFAULT_EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
export const KnownEmbeddingModels = [
  DEFAULT_EMBEDDING_MODEL,
  "@cf/baai/bge-m3",
  "@cf/baai/bge-base-en-v1.5",
];

export function estimateTokens(text: string): number {
  // Conservative for multilingual text; prompt budgeting also reserves 25% headroom.
  return Math.ceil(Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 127 ? 2 : 1 / 3), 0));
}
