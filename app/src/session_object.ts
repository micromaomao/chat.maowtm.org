import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { withRuntime } from "./runtime";
import { withDBClient, Client } from "./db";
import { adminTokenHash, hasValidAdminAuth, requireValidChatTokenAuth, requireValidChatTokenOrAdmin } from "./api/auth_basics";
import { APIError, AuthError, InvalidChatSessionError } from "./api/basics";
import { errorResponse } from "./worker";
import { addChatMessage, excludeSingleMessage, fetchMessagesByIds, findChatMessageSession, rollbackChat, userNewChatPreCheck } from "./lib/chat";
import type { FetchedChatMessage } from "./api/v1/types";
import { generateReply, generateSuggestions } from "./lib/gen_response";
import { generateToken, strToHashBuf } from "./lib/secure_token/nodejs";
import { ChatSessionEventType, SessionEvent } from "./db/mq";
import { MsgType } from "./db/enums";
import getConfigStore from "./db/config";
import client_tags from "./db/client_tag";
import { sessionSnapshot } from "./api/v1";
import { editBotMessage } from "./api/v1/admin";
import { setMessageSuggestions } from "./lib/chat_suggestions";

interface SocketAuth {
  admin: boolean;
  hash: string;
  cursor: string;
}

interface Ticket {
  auth: SocketAuth;
  expires: number;
}

interface Job {
  session: string;
  source_message: string;
  reply_message: string | null;
  attempts: number;
}

export class ChatSessionObject extends DurableObject<Env> {
  private controller: AbortController | null = null;
  private mutations: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(fn);
    this.mutations = result.then(() => undefined, () => undefined);
    return result;
  }

  private async setSession(session: string): Promise<void> {
    if (!this.ctx.id.equals(this.env.CHAT_SESSION.idFromName(session))) throw new InvalidChatSessionError();
    const previous = await this.ctx.storage.get<string>("session");
    if (previous && previous !== session) throw new Error("Durable Object session mismatch");
    if (!previous) await this.ctx.storage.put("session", session);
  }

  async fetch(request: Request): Promise<Response> {
    return withRuntime(this.env, async () => {
      try {
        const url = new URL(request.url);
        const parts = url.pathname.split("/");
        let session: string;
        if (parts[1] === "notify") {
          session = decodeURIComponent(parts[2]);
          await this.setSession(session);
          await this.serialized(() => this.broadcast(session));
          return new Response(null, { status: 204 });
        }
        if (parts[3] === "chat-session") {
          session = decodeURIComponent(parts[4]);
        } else {
          session = await withDBClient(db => findChatMessageSession(decodeURIComponent(parts[4]), db));
        }
        if (!this.ctx.id.equals(this.env.CHAT_SESSION.idFromName(session))) throw new InvalidChatSessionError();
        if (parts[5] === "ws-ticket") return await this.issueTicket(request, session);
        if (parts[5] === "ws") return await this.serialized(() => this.upgrade(request, session));

        const response = await this.serialized(async () => {
          if (parts[5] === "send-chat") return this.sendChat(request, session);
          if (parts[5] === "rollback-chat") return this.rollback(request, session, decodeURIComponent(parts[4]));
          if (parts[5] === "edit-bot") {
            if (!await hasValidAdminAuth(request)) throw new AuthError();
            await this.setSession(session);
            await withDBClient(async db => {
              await db.query("begin");
              try {
                await editBotMessage(request, decodeURIComponent(parts[4]), db);
                await db.query("commit");
              } finally {
                await db.query("rollback");
              }
            });
            return new Response(null, { status: 204 });
          }
          throw new APIError(404, "Not found");
        });
        await this.serialized(() => this.broadcast(session));
        return response;
      } catch (error) {
        return errorResponse(error);
      }
    });
  }

  private async issueTicket(request: Request, session: string): Promise<Response> {
    const auth = await withDBClient(async db => {
      await requireValidChatTokenOrAdmin(request, session, db);
      const admin = await hasValidAdminAuth(request);
      const hash = admin ? await adminTokenHash(request) :
        await strToHashBuf(new URL(request.url).searchParams.get("chat_token"));
      if (!hash) throw new AuthError();
      return { admin, hash: hash.toString("base64"), cursor: "0" };
    });
    await this.setSession(session);
    const [token, hash] = await generateToken();
    await this.ctx.storage.transaction(async storage => {
      const tickets = await storage.get<Record<string, Ticket>>("tickets") || {};
      for (const [key, ticket] of Object.entries(tickets)) {
        if (ticket.expires <= Date.now()) delete tickets[key];
      }
      if (Object.keys(tickets).length >= 64) throw new APIError(429, "Too many pending WebSocket connections");
      tickets[hash.toString("base64")] = { auth, expires: Date.now() + 60000 };
      await storage.put("tickets", tickets);
    });
    return Response.json({ ticket: token });
  }

  private async validSocket(auth: SocketAuth, session: string, db: Client): Promise<boolean> {
    const hash = Buffer.from(auth.hash, "base64");
    const { rows } = auth.admin ?
      await db.query("select 1 from admin_token where token = $1 and expiry > now()", [hash]) :
      await db.query("select 1 from chat_session where session_id = $1 and session_token = $2", [session, hash]);
    return rows.length > 0;
  }

  private async upgrade(request: Request, session: string): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new APIError(426, "WebSocket upgrade required");
    const url = new URL(request.url);
    const token = url.searchParams.get("ticket");
    const hash = token ? await strToHashBuf(token) : null;
    if (!hash) throw new AuthError();
    const ticket = await this.ctx.storage.transaction(async storage => {
      const tickets = await storage.get<Record<string, Ticket>>("tickets") || {};
      const ticket = tickets[hash.toString("base64")];
      if (ticket) {
        delete tickets[hash.toString("base64")];
        await storage.put("tickets", tickets);
      }
      return ticket;
    });
    if (!ticket || ticket.expires <= Date.now()) throw new AuthError();
    const after = url.searchParams.get("after");
    if (after && !/^\d{1,20}$/.test(after)) throw new APIError(400, "Invalid event cursor");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    let accepted = false;
    try {
      await withDBClient(async db => {
        if (!await this.validSocket(ticket.auth, session, db)) throw new AuthError();
        await this.setSession(session);
        await db.query("begin isolation level repeatable read read only");
        try {
          const { rows: [row] } = await db.query("select coalesce(max(id), 0)::text as id from chat_session_event where session = $1", [session]);
          let events = [];
          if (after && BigInt(after) <= BigInt(row.id)) {
            events = await this.eventsAfter(session, after, db);
          }
          this.ctx.acceptWebSocket(server);
          accepted = true;
          if (after && events.length <= 1000 && BigInt(after) <= BigInt(row.id)) {
            const messages = await fetchMessagesByIds(events.flatMap(event => event.payload.id ? [event.payload.id] : []), db);
            for (const event of events) await this.sendEvent(server, ticket.auth, event, db, messages);
          } else {
            server.send(JSON.stringify({ id: row.id, event: "snapshot", data: await sessionSnapshot(session, ticket.auth.admin, db) }));
          }
          ticket.auth.cursor = row.id;
          server.serializeAttachment(ticket.auth);
          server.send(JSON.stringify({ id: row.id, event: "ready" }));
          await db.query("commit");
        } finally {
          await db.query("rollback");
        }
      });
    } catch (error) {
      if (accepted) server.close(1011, "Unable to initialize chat updates");
      throw error;
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private async eventsAfter(session: string, after: string, db: Client): Promise<SessionEvent[]> {
    const { rows } = await db.query(
      "select id::text, session as session_id, payload from chat_session_event where session = $1 and id > $2::bigint order by id limit 1001",
      [session, after]
    );
    return rows;
  }

  private async sendEvent(socket: WebSocket, auth: SocketAuth, event: SessionEvent, db: Client, messages: Map<string, FetchedChatMessage>): Promise<void> {
    const payload = event.payload;
    let type = "cursor";
    let data: unknown;
    if (payload._event === ChatSessionEventType.NewSuggestions) {
      type = "suggestions";
      data = { reply_msg: payload.reply_msg, suggestions: payload.suggestions };
    } else if (payload._event === ChatSessionEventType.Reset) {
      type = "snapshot";
      data = await sessionSnapshot(event.session_id, auth.admin, db);
    } else if (payload._event !== ChatSessionEventType.MessageEdited || auth.admin) {
      type = "message";
      const message = messages.get(payload.id);
      if (!message) throw new Error("Chat event references a missing message");
      data = !auth.admin && message.metadata ?
        { ...message, metadata: { ...message.metadata, updated_before: false } } : message;
    }
    socket.send(JSON.stringify({ id: event.id, event: type, data }));
    auth.cursor = event.id;
    socket.serializeAttachment(auth);
  }

  private async broadcast(session: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const auth: SocketAuth = socket.deserializeAttachment();
        await withDBClient(async db => {
          if (!await this.validSocket(auth, session, db)) {
            socket.close(1008, "Authentication expired");
            return;
          }
          const events = await this.eventsAfter(session, auth.cursor, db);
          if (events.length > 1000) {
            const { rows: [row] } = await db.query("select max(id)::text as id from chat_session_event where session = $1", [session]);
            socket.send(JSON.stringify({ id: row.id, event: "snapshot", data: await sessionSnapshot(session, auth.admin, db) }));
            auth.cursor = row.id;
            socket.serializeAttachment(auth);
          } else {
            const messages = await fetchMessagesByIds(events.flatMap(event => event.payload.id ? [event.payload.id] : []), db);
            for (const event of events) await this.sendEvent(socket, auth, event, db, messages);
          }
        });
      } catch (error) {
        console.error("WebSocket delivery failed", error);
        socket.close(1011, "Reconnect to restore chat updates");
      }
    }
  }

  private async sendChat(request: Request, session: string): Promise<Response> {
    const body = await request.json<{ message: string; client_tag?: string }>();
    const result = await withDBClient(async db => {
      await requireValidChatTokenAuth(request, session, db);
      await this.setSession(session);
      // Arm before committing the job so an eviction cannot strand a committed message.
      await this.ctx.storage.setAlarm(Date.now() + 500);
      await db.query("begin");
      try {
        const previous = await client_tags.checkTag(body.client_tag, `send:${session}`);
        if (previous) return { id: String(previous.response), created: false, rateLimit: undefined };
        const rateLimit = !await hasValidAdminAuth(request) ? await userNewChatPreCheck(session, db) : undefined;
        const store = await getConfigStore();
        const message = await addChatMessage({
          session_id: session, msg_type: MsgType.User, content: body.message,
          generation_model: store.generation_model.model_name, client_tag: body.client_tag,
        }, db);
        await db.query(
          `insert into chat_generation_job (session, source_message) values ($1, $2)
           on conflict (session) do update set source_message = excluded.source_message, reply_message = null, attempts = 0`,
          [session, message.id]
        );
        await client_tags.setTag(body.client_tag, message.id, `send:${session}`, message.id);
        await db.query("commit");
        return { id: message.id, created: true, rateLimit };
      } finally {
        await db.query("rollback");
      }
    });
    if (result.created) this.controller?.abort();
    const headers: Record<string, string> = { "Content-Type": "text/plain" };
    if (result.rateLimit) {
      headers["RateLimit-Limit"] = String(result.rateLimit.limit);
      headers["RateLimit-Remaining"] = String(result.rateLimit.remaining);
      headers["RateLimit-Reset"] = String(result.rateLimit.reset_remaining_secs);
    }
    return new Response(result.id, { headers });
  }

  private async rollback(request: Request, session: string, message: string): Promise<Response> {
    await withDBClient(async db => {
      await requireValidChatTokenAuth(request, session, db);
      await this.setSession(session);
      await db.query("begin");
      try {
        await rollbackChat(session, message, db);
        await db.query("commit");
      } finally {
        await db.query("rollback");
      }
    });
    this.controller?.abort();
    await this.ctx.storage.deleteAlarm();
    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    return withRuntime(this.env, async () => {
      const session = await this.ctx.storage.get<string>("session");
      if (!session) return;
      const job: Job | undefined = await this.serialized(async () => {
        await this.ctx.storage.setAlarm(Date.now() + 60000);
        const pending = await withDBClient(async db => (await db.query(
          "select * from chat_generation_job where session = $1", [session]
        )).rows[0]);
        if (!pending) await this.ctx.storage.deleteAlarm();
        return pending;
      });
      if (!job) return;
      const controller = new AbortController();
      this.controller = controller;
      try {
        if (job.reply_message) {
          const suggestions = await generateSuggestions(session, job.source_message, job.reply_message, controller.signal);
          await this.commitJob(job, async db => {
            await setMessageSuggestions(job.reply_message, suggestions, db);
            await db.query("delete from chat_generation_job where session = $1", [session]);
          });
        } else {
          const reply = await generateReply(session, job.source_message, controller.signal);
          await this.commitJob(job, async db => {
            const message = await addChatMessage(reply.message, db);
            if (reply.suggestions.length) {
              await setMessageSuggestions(message.id, reply.suggestions, db);
              await db.query("delete from chat_generation_job where session = $1", [session]);
            } else {
              await db.query("update chat_generation_job set reply_message = $2, attempts = 0 where session = $1", [session, message.id]);
            }
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Chat generation failed", { session, source: job.source_message, attempt: job.attempts + 1 }, error);
          await this.commitJob(job, async db => {
            if (job.attempts < 2) {
              await db.query("update chat_generation_job set attempts = attempts + 1 where session = $1", [session]);
            } else {
              if (!job.reply_message) {
                await addChatMessage({
                  session_id: session, msg_type: MsgType.Error,
                  content: "Failed to generate a reply. Please try again later or roll back your previous message.",
                }, db);
                await excludeSingleMessage(job.source_message, db);
              }
              await db.query("delete from chat_generation_job where session = $1", [session]);
            }
          });
        }
      } finally {
        if (this.controller === controller) this.controller = null;
        await this.serialized(async () => {
          const pending = await withDBClient(async db => (await db.query(
            "select attempts from chat_generation_job where session = $1", [session]
          )).rows[0]);
          if (pending) await this.ctx.storage.setAlarm(Date.now() + 1000 * 2 ** pending.attempts);
          else await this.ctx.storage.deleteAlarm();
        });
        await this.serialized(() => this.broadcast(session));
      }
    });
  }

  private async commitJob(job: Job, fn: (db: Client) => Promise<void>): Promise<void> {
    await this.serialized(() => withDBClient(async db => {
      await db.query("begin");
      try {
        const { rows } = await db.query("select * from chat_generation_job where session = $1 for update", [job.session]);
        if (rows[0]?.source_message !== job.source_message || rows[0]?.reply_message !== job.reply_message) return;
        await fn(db);
        await db.query("commit");
      } finally {
        await db.query("rollback");
      }
    }));
  }

  async webSocketMessage(socket: WebSocket): Promise<void> {
    socket.close(1008, "Send chat messages using the authenticated HTTP API");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) socket.close(code, reason);
    else socket.close();
  }

  webSocketError(socket: WebSocket, error: unknown): void {
    console.error("Chat WebSocket error", error);
    socket.close(1011, "WebSocket error");
  }
}
