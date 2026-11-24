import { Hono } from "hono";
import type { Env } from "../../env";
import apiSpec from "../../../../api.json";
import adminRoutes from "./admin";
import client_tags from "db/client_tag";
import { fetchLastChatMessages, findChatMessageSession, newChatSssion, userNewSessionPreCheck } from "lib/chat";
import { withDBClient, Client } from "db/index";
import type { FetchedChatMessage, ChatSuggestions } from "./types";
import { hasValidAdminAuth, requireValidChatTokenOrAdmin, sameOrigin } from "../auth_basics";
import { fetchSuggestions } from "lib/chat_suggestions";
import { validateRequest } from "../validation";
import { clientTagKey } from "../../lib/secure_token/nodejs";

const app = new Hono<{ Bindings: Env }>();
app.get("/spec", c => c.json(apiSpec));
app.use("*", validateRequest);

app.post("/chat-session", async c => {
  sameOrigin(c);
  const text = await c.req.text();
  const body: { client_tag?: string } = text ? await c.req.json() : {};
  const result = await withDBClient(async db => {
    await db.query("begin");
    try {
      if (body.client_tag) {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [await clientTagKey(body.client_tag, "new-session")]);
      }
      const previous = await client_tags.checkTag(body.client_tag, "new-session");
      if (previous) return previous.response;
      if (!await hasValidAdminAuth(c.req.raw)) await userNewSessionPreCheck(db);
      const result = await newChatSssion(db, body.client_tag);
      await client_tags.setTag(body.client_tag, result, "new-session");
      await db.query("commit");
      return result;
    } finally {
      await db.query("rollback");
    }
  });
  return c.json(result, 201);
});

export async function sessionSnapshot(session: string, admin: boolean, db?: Client): Promise<{ messages: FetchedChatMessage[]; last_suggestions?: ChatSuggestions }> {
  if (!db) return withDBClient(db => sessionSnapshot(session, admin, db));
  const messages = await fetchLastChatMessages({ session_id: session, limit: 1000, db_client: db });
  if (!admin) {
    for (const message of messages) {
      if (message.metadata) message.metadata.updated_before = false;
    }
  }
  const last = messages[messages.length - 1];
  const suggestions = last ? await fetchSuggestions(last.id, db) : [];
  return {
    messages,
    last_suggestions: suggestions.length ? { reply_msg: last.id, suggestions } : undefined,
  };
}

app.get("/chat-session/:session_id", async c => {
  const session = c.req.param("session_id");
  const result = await withDBClient(async db => {
    await requireValidChatTokenOrAdmin(c.req.raw, session, db);
    const admin = await hasValidAdminAuth(c.req.raw);
    const messages = await fetchLastChatMessages({
      session_id: session,
      limit: Number(c.req.query("limit") || 1000),
      until: c.req.query("until"),
      db_client: db,
    });
    if (!admin) {
      for (const message of messages) if (message.metadata) message.metadata.updated_before = false;
    }
    const last = messages[messages.length - 1];
    const suggestions = last ? await fetchSuggestions(last.id, db) : [];
    return { messages, last_suggestions: suggestions.length ? { reply_msg: last.id, suggestions } : undefined };
  });
  return c.json(result);
});

for (const action of ["ws", "ws-ticket", "send-chat"]) {
  app.on(action === "ws" ? "GET" : "POST", `/chat-session/:session_id/${action}`, c => {
    sameOrigin(c);
    return c.env.CHAT_SESSION.get(c.env.CHAT_SESSION.idFromName(c.req.param("session_id"))).fetch(c.req.raw);
  });
}

app.post("/messages/:msg_id/rollback-chat", async c => {
  sameOrigin(c);
  const session = await withDBClient(db => findChatMessageSession(c.req.param("msg_id"), db));
  return c.env.CHAT_SESSION.get(c.env.CHAT_SESSION.idFromName(session)).fetch(c.req.raw);
});

app.put("/messages/:msg_id/edit-bot", async c => {
  sameOrigin(c);
  const session = await withDBClient(db => findChatMessageSession(c.req.param("msg_id"), db));
  return c.env.CHAT_SESSION.get(c.env.CHAT_SESSION.idFromName(session)).fetch(c.req.raw);
});

app.route("/", adminRoutes);
export default app;
