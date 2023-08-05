import { TOKEN_LENGTH, TOKEN_PREFIX } from "./shared";

export async function base64encode(arr: Uint8Array | ArrayBuffer): Promise<string> {
  if (arr instanceof ArrayBuffer) {
    arr = new Uint8Array(arr);
  }
  return btoa(String.fromCharCode.apply(null, arr));
}

export async function generateToken(): Promise<{ token_str: string, hash_b64: string }> {
  let token_data = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  let hash_data = await crypto.subtle.digest("SHA-256", token_data);
  let token_str = TOKEN_PREFIX + (await base64encode(token_data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return { token_str, hash_b64: await base64encode(hash_data) };
}
