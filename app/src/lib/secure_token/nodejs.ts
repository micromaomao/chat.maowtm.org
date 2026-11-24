import { generateToken as browserGenerateToken } from "./browser";
import { TOKEN_LENGTH, TOKEN_PREFIX } from "./shared";
export { TOKEN_LENGTH, TOKEN_PREFIX };

/**
 * Generate a secure token, returning the string that should be provided to the
 * user, and a buffer containing a secure hash of the token.
 */
export async function generateToken(): Promise<[string, Buffer]> {
  const { token_str, hash_b64 } = await browserGenerateToken();
  return [token_str, Buffer.from(hash_b64, "base64")];
}

export async function tokenFromClientTag(tag: string): Promise<[string, Buffer]> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`chat-session-token:${tag}`));
  const data = new Uint8Array(digest).slice(0, TOKEN_LENGTH);
  const token = TOKEN_PREFIX + Buffer.from(data).toString("base64url");
  return [token, await strToHashBuf(token)];
}

export async function clientTagKey(tag: string, scope: string): Promise<string> {
  if (scope !== "new-session") return tag;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`chat-session-cache:${tag}`));
  return Buffer.from(digest).toString("hex");
}

export async function strToHashBuf(token_str: string): Promise<Buffer | null> {
  if (!new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{32}$`).test(token_str)) {
    return null;
  }
  const token_data = Buffer.from(token_str.substring(TOKEN_PREFIX.length), "base64url");
  if (token_data.byteLength != TOKEN_LENGTH) return null;
  return Buffer.from(await crypto.subtle.digest("SHA-256", new Uint8Array(token_data)));
}
