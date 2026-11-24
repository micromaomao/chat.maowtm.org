import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { argumentsFor, database } from "../scripts/environment";
import { clientTagKey, generateToken } from "../src/lib/secure_token/nodejs";

interface Frame {
  id: string;
  event: string;
  data?: { id?: string; msg_type?: string; messages?: { id: string; exclude_from_generation: boolean }[] };
}

async function main() {
  const args = argumentsFor({ url: { type: "string" } });
  if (!args.url) throw new Error("Pass --url for the target staging Worker");
  const base = new URL(String(args.url));
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new Error("Use HTTPS for a remote staging Worker");
  }
  const db = database();
  await db.connect();
  const [admin, hash] = await generateToken();
  const [sessionTag] = await generateToken();
  const sockets: WebSocket[] = [];
  let session: string | null = null;
  let dialogue: string | null = null;
  const headers = { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" };

  async function request(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(new URL(`/api/v1${path}`, base), { headers, ...options, signal: AbortSignal.timeout(120000) });
  }
  async function json(path: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await request(path, options);
    assert.ok(response.ok, `API request failed: ${response.status} ${await response.clone().text()}`);
    const result: unknown = await response.json();
    assert.ok(typeof result === "object" && result !== null && !Array.isArray(result));
    return result as Record<string, unknown>;
  }
  async function waitFor(check: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 120000;
    while (!await check()) {
      if (Date.now() >= deadline) throw new Error("Timed out waiting for a staging chat update");
      await sleep(100);
    }
  }
  async function connect(chatToken: string, after?: string) {
    const ticket = await json(`/chat-session/${session}/ws-ticket?chat_token=${encodeURIComponent(chatToken)}`, { method: "POST", headers: {} });
    assert.equal(typeof ticket.ticket, "string");
    const url = new URL(`/api/v1/chat-session/${session}/ws`, base);
    url.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", String(ticket.ticket));
    if (after) url.searchParams.set("after", after);
    const socket = new WebSocket(url);
    sockets.push(socket);
    const frames: Frame[] = [];
    let pong = false;
    let failure: Error | null = null;
    socket.onmessage = message => {
      if (message.data === "pong") pong = true;
      else frames.push(JSON.parse(String(message.data)));
    };
    socket.onerror = () => { failure = new Error("Staging WebSocket failed"); };
    await waitFor(() => {
      if (failure) throw failure;
      return frames.some(frame => frame.event === "ready");
    });
    return { socket, frames, pong: () => pong };
  }

  try {
    await db.query("insert into admin_token (token, expiry) values ($1, now() + interval '1 hour')", [hash]);
    const created = await json("/chat-session", { method: "POST", body: JSON.stringify({ client_tag: sessionTag }) });
    assert.equal(typeof created.session_id, "string");
    assert.equal(typeof created.chat_token, "string");
    session = String(created.session_id);
    const chatToken = String(created.chat_token);
    assert.deepEqual(await json("/chat-session", { method: "POST", body: JSON.stringify({ client_tag: sessionTag }) }), created);
    const unauthorized = await request(`/chat-session/${session}?chat_token=invalid`, { headers: {} });
    assert.equal(unauthorized.status, 404);
    const first = await connect(chatToken);
    first.socket.send("ping");
    await waitFor(first.pong);
    const [sendTag] = await generateToken();
    const path = `/chat-session/${session}/send-chat?chat_token=${encodeURIComponent(chatToken)}`;
    const body = JSON.stringify({ message: "Hello! Please introduce yourself briefly.", client_tag: sendTag });
    const sent = await request(path, { method: "POST", body });
    assert.ok(sent.ok, `Send failed: ${sent.status} ${await sent.clone().text()}`);
    const message = await sent.text();
    assert.equal(await (await request(path, { method: "POST", body })).text(), message);
    await waitFor(() => first.frames.some(frame => frame.event === "message" && frame.data?.msg_type === "bot" && frame.data.id > message));
    const reply = first.frames.find(frame => frame.event === "message" && frame.data?.msg_type === "bot" && frame.data.id > message).data.id;
    console.log("Live generation, idempotency, authentication, and automatic ping/pong succeeded.");

    const cursor = first.frames[first.frames.length - 1].id;
    first.socket.close();
    const secondSend = await request(path, {
      method: "POST", body: JSON.stringify({ message: "Thanks! Tell me one more thing about yourself." }),
    });
    assert.ok(secondSend.ok);
    const secondMessage = await secondSend.text();
    await waitFor(async () => {
      const history = await json(`/chat-session/${session}?chat_token=${encodeURIComponent(chatToken)}`);
      assert.ok(Array.isArray(history.messages));
      return history.messages.some(message => message.msg_type === "bot" && message.id > secondMessage);
    });
    const resumed = await connect(chatToken, cursor);
    assert.ok(resumed.frames.some(frame => frame.event === "message" && frame.data?.msg_type === "bot" && frame.data.id > secondMessage));
    assert.equal((await request(`/messages/${secondMessage}/rollback-chat?chat_token=${encodeURIComponent(chatToken)}`, { method: "POST" })).status, 204);
    await waitFor(() => resumed.frames.some(frame => frame.event === "snapshot" &&
      frame.data.messages.some(message => message.id === secondMessage && message.exclude_from_generation)));
    console.log("Reconnect replay and rollback synchronization succeeded.");

    const [editTag] = await generateToken();
    assert.equal((await request(`/messages/${reply}/edit-bot`, {
      method: "PUT",
      body: JSON.stringify({ parent_id: null, phrasings: ["Cloudflare migration smoke test"], reply: "A temporary test response.", client_tag: editTag }),
    })).status, 204);
    const inspected = await json(`/messages/${reply}/inspect-last-edit`);
    assert.equal(inspected.edited, true);
    assert.ok(typeof inspected.updated_dialogue_item === "object" && inspected.updated_dialogue_item !== null && "path" in inspected.updated_dialogue_item);
    const item = inspected.updated_dialogue_item;
    assert.ok(Array.isArray(item.path));
    dialogue = String(item.path[item.path.length - 1].dialogue_id);
    console.log("Admin editing and automatic RAG embedding succeeded.");
  } finally {
    for (const socket of sockets) socket.close();
    try {
      if (dialogue) await db.query("delete from dialogue_group where id = (select dialogue_group from dialogue_item where item_id = $1)", [dialogue]);
      if (session) await db.query("delete from chat_session where session_id = $1", [session]);
      await db.query("delete from client_tag where scope = 'new-session' and tag = $1", [await clientTagKey(sessionTag, "new-session")]);
      await db.query("delete from admin_token where token = $1", [hash]);
    } finally {
      await db.end();
    }
  }
}

main().catch(error => {
  console.error("Staging smoke test failed:", error.message);
  process.exitCode = 1;
});
