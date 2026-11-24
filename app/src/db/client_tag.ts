import { withDBClient } from ".";
import { clientTagKey, tokenFromClientTag } from "../lib/secure_token/nodejs";

interface ClientTagEntry {
  response: unknown;
}

class ClientTagManager {
  async checkTag(tag: string | undefined, scope: string): Promise<ClientTagEntry | null> {
    if (!tag) return null;
    const key = await clientTagKey(tag, scope);
    return withDBClient(async db => {
      const { rows } = await db.query(
        "select response from client_tag where scope = $1 and tag = $2",
        [scope, key]
      );
      const entry = rows[0];
      if (!entry) return null;
      if (scope === "new-session") {
        const [chat_token] = await tokenFromClientTag(tag);
        return { response: { ...entry.response, chat_token } };
      }
      return entry;
    });
  }

  async setTag(tag: string | undefined, response: unknown, scope: string, message?: string): Promise<void> {
    if (!tag) return;
    const key = await clientTagKey(tag, scope);
    if (scope === "new-session") {
      if (typeof response !== "object" || response === null || !("session_id" in response)) {
        throw new Error("Invalid new-session idempotency response");
      }
      response = { session_id: response.session_id };
    }
    await withDBClient(db => db.query(
      "insert into client_tag (scope, tag, response, message) values ($1, $2, $3, $4)",
      [scope, key, JSON.stringify(response), message]
    ));
  }

  async ulidToTag(message: string): Promise<string | undefined> {
    return withDBClient(async db => {
      const { rows } = await db.query("select tag from client_tag where message = $1", [message]);
      return rows[0]?.tag;
    });
  }
}

export default new ClientTagManager();
