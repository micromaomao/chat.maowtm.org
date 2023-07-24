import { randomBytes, createHash } from "crypto";

export const TOKEN_PREFIX = "sk_";
const TOKEN_LENGTH = 24;
/**
 * Generate a secure token, returning the string that should be provided to the
 * user, and a buffer containing a secure hash of the token.
 */
export function generateToken(): Promise<[string, Buffer]> {
  return new Promise((resolve, reject) => {
    randomBytes(TOKEN_LENGTH, (err, token_data) => {
      if (err) {
        reject(err);
        return;
      }
      if (token_data.byteLength != TOKEN_LENGTH) {
        reject(new Error("randomBytes returned a buffer of the wrong length"));
        return;
      }
      const hash = createHash("sha256");
      hash.update(token_data);
      const hash_data = hash.digest();
      resolve([TOKEN_PREFIX + token_data.toString("base64url"), hash_data]);
    });
  });
}

export function strToHashBuf(token_str: string): Buffer | null {
  if (!token_str.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  try {
    const token_data = Buffer.from(token_str.substring(TOKEN_PREFIX.length), "base64url");
    if (token_data.byteLength != TOKEN_LENGTH) {
      return null;
    }
    const hash = createHash("sha256");
    hash.update(token_data);
    return hash.digest();
  } catch (e) {
    return null;
  }
}
