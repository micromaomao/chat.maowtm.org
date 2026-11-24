import { afterEach, describe, expect, it, vi } from "vitest";
import { env, exports } from "cloudflare:workers";
import { evictDurableObject, reset, runInDurableObject } from "cloudflare:test";
import { generateToken, tokenFromClientTag } from "../src/lib/secure_token/nodejs";
import { generateReply } from "../src/lib/gen_response";
import * as chat from "../src/lib/chat";
import { MsgType } from "../src/db/enums";
import type { ChatSessionObject } from "../src/session_object";
import type { CachedDialogueItem, CachedPhrasing } from "../src/lib/match_dialogue";
import { defaultConfig } from "../src/db/default_config";
import { withRuntime } from "../src/runtime";
import clientTags from "../src/db/client_tag";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

function bounded<T>(promise: Promise<T>, label: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeout);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

vi.mock("../src/db", () => ({
  withDBClient: async (fn: (client: object) => Promise<unknown>) => fn({ query: mocks.query }),
}));
vi.mock("../src/lib/gen_response", () => ({
  generateReply: vi.fn(),
  generateSuggestions: vi.fn(),
}));

afterEach(async () => {
  await reset();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("durable chat coordination", () => {
  it("keeps authenticated sockets through hibernation, auto-pongs, and consumes tickets once", async () => {
    const session = "hibernation-test";
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(session));
    const [token, hash] = await generateToken();
    mocks.query.mockImplementation(async (statement: string | { text: string }) => {
      const sql = typeof statement === "string" ? statement : statement.text;
      if (sql.includes("select 1 from chat_session")) return { rows: [{}] };
      if (sql.includes("max(id)")) return { rows: [{ id: "0" }] };
      return { rows: [] };
    });
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put("tickets", {
        [hash.toString("base64")]: {
          expires: Date.now() + 60000,
          auth: { admin: false, hash: hash.toString("base64"), cursor: "0" },
        },
      });
    });
    const url = `https://test/api/v1/chat-session/${session}/ws?ticket=${token}`;
    const response = await exports.default.fetch(url, { headers: { Upgrade: "websocket" } });
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    const ready = new Promise<void>(resolve => {
      const listener = (event: MessageEvent) => {
        if (JSON.parse(String(event.data)).event === "ready") {
          socket.removeEventListener("message", listener);
          resolve();
        }
      };
      socket.addEventListener("message", listener);
    });
    socket.accept();
    await bounded(ready, "initial WebSocket frames");
    const rejected = await exports.default.fetch(url, { headers: { Upgrade: "websocket" } });
    expect(rejected.status).toBe(401);
    await rejected.text();
    await bounded(evictDurableObject(stub, { webSockets: "hibernate" }), "Durable Object eviction");
    const pong = new Promise<string>(resolve => {
      socket.addEventListener("message", event => resolve(String(event.data)), { once: true });
    });
    socket.send("ping");
    expect(await bounded(pong, "hibernating auto-response")).toBe("pong");
    const attachment = await runInDurableObject(stub, (_instance, state) => state.getWebSockets()[0].deserializeAttachment());
    expect(attachment).toEqual({ admin: false, hash: hash.toString("base64"), cursor: "0" });
    socket.close();
  });

  it("discards a completed AI reply when the durable job has been superseded", async () => {
    const session = "superseded-test";
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(session));
    const job = { session, source_message: "old", reply_message: null, attempts: 0 };
    mocks.query.mockImplementation(async (statement: string | { text: string }) => {
      const sql = typeof statement === "string" ? statement : statement.text;
      if (sql.includes("select * from chat_generation_job")) return { rows: [{ ...job }] };
      if (sql.includes("select attempts")) return { rows: [{ attempts: 0 }] };
      return { rows: [] };
    });
    vi.mocked(generateReply).mockImplementation(async () => {
      job.source_message = "new";
      return { message: { session_id: session, msg_type: MsgType.Bot, content: "stale" }, suggestions: [] };
    });
    const insert = vi.spyOn(chat, "addChatMessage");
    await runInDurableObject<ChatSessionObject, void>(stub, async (instance, state) => {
      await state.storage.put("session", session);
      await instance.alarm();
      await state.storage.deleteAlarm();
    });
    expect(insert).not.toHaveBeenCalled();
    expect(job.source_message).toBe("new");
  });

  it("keeps a recovery alarm when Postgres is temporarily unavailable", async () => {
    const session = "database-outage-test";
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(session));
    mocks.query.mockRejectedValueOnce(new Error("Database unavailable"));
    await runInDurableObject<ChatSessionObject, void>(stub, async (instance, state) => {
      await state.storage.put("session", session);
      await expect(instance.alarm()).rejects.toThrow("Database unavailable");
      expect(await state.storage.getAlarm()).not.toBeNull();
      await state.storage.deleteAlarm();
    });
  });

  it("waits for an accepted message to commit before reading its pending job", async () => {
    const session = "commit-race-test";
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(session));
    const [token] = await generateToken();
    const result = await runInDurableObject<ChatSessionObject, { message: string; completed: boolean }>(stub, async instance => {
      let markCommit: () => void;
      const enteringCommit = new Promise<void>(resolve => { markCommit = resolve; });
      let releaseCommit: () => void;
      const commitGate = new Promise<void>(resolve => { releaseCommit = resolve; });
      let committed = false;
      let messageCount = 0;
      let job: { session: string; source_message: string; reply_message: null; attempts: number } | undefined;
      mocks.query.mockImplementation(async (statement: string | { text: string }) => {
        const sql = typeof statement === "string" ? statement : statement.text;
        if (sql.startsWith("select session_id")) return { rows: [{ session_id: session }] };
        if (sql.includes("from global_configuration")) return { rows: [{ id: "config", config: defaultConfig("<|DIALOGUE_ITEMS|>") }] };
        if (sql.includes("returning last_reset")) return { rows: [{ last_reset: new Date(), db_now: new Date(), count: 1 }] };
        if (sql.startsWith("insert into chat_message ")) return { rows: [{ id: String(++messageCount) }] };
        if (sql.startsWith("insert into chat_session_event")) return { rows: [{ id: "1" }] };
        if (sql.includes("insert into chat_generation_job")) job = { session, source_message: "1", reply_message: null, attempts: 0 };
        if (sql === "commit" && !committed) {
          markCommit();
          await commitGate;
          committed = true;
        }
        if (sql.includes("select * from chat_generation_job")) return { rows: committed && job ? [{ ...job }] : [] };
        if (sql.startsWith("select session from chat_message")) return { rows: [{ session }] };
        if (sql.startsWith("delete from chat_generation_job")) job = undefined;
        return { rows: [] };
      });
      vi.mocked(generateReply).mockImplementation(async () => ({
        message: { session_id: session, msg_type: MsgType.Bot, content: "reply" },
        suggestions: ["follow-up"],
      }));
      const sent = instance.fetch(new Request(`https://test/api/v1/chat-session/${session}/send-chat?chat_token=${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }));
      await bounded(enteringCommit, "message transaction");
      const alarm = instance.alarm();
      await new Promise(resolve => setTimeout(resolve, 0));
      releaseCommit();
      const response = await bounded(sent, "accepted message");
      const message = await response.text();
      await bounded(alarm, "post-commit generation");
      return { message, completed: job === undefined };
    });
    expect(result).toEqual({ message: "1", completed: true });
    expect(generateReply).toHaveBeenCalledWith(session, "1", expect.any(AbortSignal));
  });

  it("persists a compact event even when RAG metadata contains cyclic matcher objects", async () => {
    const item: CachedDialogueItem = {
      arr_idx: 0, dialogue_item_id: "item", dialogue_group_id: "group",
      ignore_for_first_match: false, parent: null, canonical_phrasing: null, response_tokens: 1,
    };
    const phrasing: CachedPhrasing = { arr_idx: 0, item, phrasing_id: "phrasing", is_counter: false, q_tokens: 1 };
    item.canonical_phrasing = phrasing;
    mocks.query.mockImplementation(async (statement: string | { text: string }) => {
      const sql = typeof statement === "string" ? statement : statement.text;
      if (sql.includes("from global_configuration")) {
        return { rows: [{ id: "config", config: defaultConfig("<|DIALOGUE_ITEMS|>") }] };
      }
      return { rows: [{ id: "1" }] };
    });
    await withRuntime(env, () => chat.addChatMessage({
      session_id: "session", msg_type: MsgType.Bot, content: "reply",
      reply_metadata: {
        item_matches: [{ item, best_phrasing: phrasing, score: 1 }],
        direct_result: false, model_sample_input: [], model_chat_inputs: [],
      },
    }));
    const event = mocks.query.mock.calls.find(([sql]) => typeof sql === "string" && sql.startsWith("insert into chat_session_event"));
    expect(JSON.parse(event[1][1])).toEqual({ _event: "new_chat_message", id: "1" });
  });

  it("replays new-session credentials without storing the plaintext token or its derivation key", async () => {
    const [tag] = await generateToken();
    const [chat_token] = await tokenFromClientTag(tag);
    let stored: unknown[];
    mocks.query.mockImplementation(async (sql: string, values: unknown[]) => {
      if (sql.startsWith("insert into client_tag")) stored = values;
      return { rows: stored ? [{ response: JSON.parse(String(stored[2])) }] : [] };
    });
    await withRuntime(env, async () => {
      await clientTags.setTag(tag, { session_id: "session", chat_token }, "new-session");
      expect(stored[1]).not.toBe(tag);
      expect(JSON.parse(String(stored[2]))).toEqual({ session_id: "session" });
      expect(await clientTags.checkTag(tag, "new-session")).toEqual({ response: { session_id: "session", chat_token } });
    });
  });
});
