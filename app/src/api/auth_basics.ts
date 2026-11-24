import { FetchedChatSession, fetchChatSession } from "lib/chat";
import { strToHashBuf } from "lib/secure_token/nodejs";
import { Client as DBClient, withDBClient } from "db/index";
import { AuthError, InvalidChatSessionError } from "./basics";
import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env";

export async function adminTokenHash(request: Request): Promise<Buffer | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return strToHashBuf(authorization.slice(7));
}

export async function hasValidAdminAuth(request: Request): Promise<boolean> {
  const hash = await adminTokenHash(request);
  if (!hash) return false;
  return withDBClient(async db => {
    const { rows } = await db.query(
      "select 1 from admin_token where token = $1 and expiry > now()", [hash]
    );
    return rows.length > 0;
  });
}

export const requireAdminAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!await hasValidAdminAuth(c.req.raw)) throw new AuthError();
  await next();
};

export async function requireValidChatTokenAuth(request: Request, session_id: string, db: DBClient): Promise<FetchedChatSession> {
  const token = new URL(request.url).searchParams.get("chat_token");
  const hash = token ? await strToHashBuf(token) : null;
  if (!hash) throw new InvalidChatSessionError();
  const { rows } = await db.query(
    "select session_id from chat_session where session_id = $1 and session_token = $2",
    [session_id, hash]
  );
  if (!rows.length) throw new InvalidChatSessionError();
  return rows[0];
}

export async function requireValidChatTokenOrAdmin(request: Request, session_id: string, db?: DBClient): Promise<FetchedChatSession> {
  if (!db) return withDBClient(db => requireValidChatTokenOrAdmin(request, session_id, db));
  if (await hasValidAdminAuth(request)) {
    const session = await fetchChatSession(session_id, db);
    if (!session) throw new InvalidChatSessionError();
    return session;
  }
  return requireValidChatTokenAuth(request, session_id, db);
}

export function sameOrigin(c: Context<{ Bindings: Env }>): void {
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin) {
    throw new AuthError();
  }
}
