import { FetchedChatSession, fetchChatSession } from "lib/chat";
import { strToHashBuf } from "lib/secure_token";
import { Client as DBClient, withDBClient } from "db/index";

export class APIError extends Error {
  status;
  constructor(status?: number, message?: string) {
    super(message || "Unknown error");
    this.status = status || 500;
  }
}

export class AuthError extends APIError {
  constructor() {
    super(401, "Unauthorized");
  }
}

export class InvalidChatSessionError extends APIError {
  constructor() {
    super(404, "Invalid chat ID or token");
  }
}

export async function hasValidAdminAuth(req): Promise<boolean> {
  // TODO
  return (
    process.env.NODE_ENV == "development" &&
    ["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(req.ip) && !req.get("X-Forwarded-For")
  );
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
