import { FetchedChatSession, fetchChatSession } from "lib/chat";
import { strToHashBuf } from "lib/secure_token/nodejs";
import { Client as DBClient, withDBClient } from "db/index";
import { APIError, AuthError, InvalidChatSessionError } from "./basics"

export async function hasValidAdminAuth(req): Promise<boolean> {
  let authorization = req.get("Authorization");
  if (typeof authorization != "string" || !authorization) {
    return false;
  }
  const start = "Bearer ";
  if (!authorization.startsWith(start)) {
    return false;
  }
  let token_str = authorization.slice(start.length);
  let hash = strToHashBuf(token_str);
  if (!hash) {
    throw new APIError(400, "Invalid admin token");
  }
  return await withDBClient(async db => {
    let { rows }: { rows: any[] } = await db.query({
      text: "select expiry from admin_token where token = $1",
      values: [hash],
    });
    if (rows.length == 0) {
      return false;
    }
    if (rows[0].expiry.getTime() < Date.now()) {
      try {
        await db.query({
          text: "delete from admin_token where token = $1",
          values: [hash],
        });
      } catch (e) {
        console.error("Unable to delete expired admin token", e);
      }
      return false;
    } else {
      return true;
    }
  });
}

export async function requireAdminAuth(req, res, next) {
  if (await hasValidAdminAuth(req) === true) {
    return next();
  }
  const auth_error = new AuthError();
  return next(auth_error);
}

export async function requireValidChatTokenAuth(req, session_id: string, db: DBClient): Promise<FetchedChatSession> {
  let token = req.query.chat_token;
  if (typeof token != "string") {
    throw new InvalidChatSessionError();
  }
  let hash_buf = strToHashBuf(token);
  if (!hash_buf) {
    throw new InvalidChatSessionError();
  }
  let res = await db.query({
    text: "select session_id from chat_session where session_id = $1 and session_token = $2",
    values: [session_id, hash_buf],
  });
  if (res.rows.length == 0) {
    throw new InvalidChatSessionError();
  }
  return res.rows[0] as FetchedChatSession;
}

export async function requireValidChatTokenOrAdmin(req, session_id: string, db?: DBClient): Promise<FetchedChatSession> {
  if (!db) {
    return await withDBClient(db => requireValidChatTokenOrAdmin(req, session_id, db));
  }
  let session: FetchedChatSession;
  if (await hasValidAdminAuth(req) === true) {
    session = await fetchChatSession(session_id, db);
    if (!session) {
      throw new InvalidChatSessionError();
    }
  } else {
    session = await requireValidChatTokenAuth(req, session_id, db);
  }
  return session;
}
