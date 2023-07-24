import Router from "lib/promise_router";
import * as OpenApiValidator from "express-openapi-validator";
import apiSpec from "../../../../api.json";
import adminRoutes from "./admin";
import client_tags from "db/client_tag";
import { generateToken, strToHashBuf } from "lib/secure_token";
import { addChatMessage, fetchChatSession, fetchLastChatMessages, newChatSssion } from "lib/chat";
import getConfigStore from "db/config";
import { withDBClient, Client as DBClient } from "db/index";
import { InvalidChatSessionError, hasValidAdminAuth } from "../basic"

const apiRouter = Router();

apiRouter.get('/spec', (req, res) => {
  res.json(apiSpec);
});

apiRouter.use(OpenApiValidator.middleware({
  apiSpec: apiSpec as any,
  validateRequests: true,
  validateResponses: process.env.NODE_ENV !== "production",
  validateSecurity: false,
  validateApiSpec: false, // The package does not do API spec validation correctly.
}));

apiRouter.post("/chat-session", async (req, res) => {
  const client_tag = req.body.client_tag;
  const tag_entry = await client_tags.checkTag(client_tag);
  if (tag_entry) {
    res.status(201).json(tag_entry.response);
    return;
  }
  const ret = await newChatSssion();
  await client_tags.setTag(client_tag, ret);
  res.status(201).json(ret);
});

async function requireValidChatTokenAuth(req, session_id: string, db: DBClient): Promise<void> {
  let token = req.query.chat_token;
  if (typeof token != "string") {
    throw new InvalidChatSessionError();
  }
  let hash_buf = strToHashBuf(token);
  if (!hash_buf) {
    throw new InvalidChatSessionError();
  }
  let res = await db.query({
    text: "select 1 from chat_session where session_id = $1 and session_token = $2",
    values: [session_id, hash_buf],
  });
  if (res.rows.length == 0) {
    throw new InvalidChatSessionError();
  }
}

apiRouter.get("/chat-session/:session_id", async (req, res) => {
  const session_id = req.params.session_id;
  const limit = (req.query.limit === undefined) ? 1000 : parseInt(req.query.limit as string);
  const until = req.query.until as string | undefined;
  const has_admin = await hasValidAdminAuth(req) === true;
  let ret = await withDBClient(async db => {
    if (!has_admin) {
      await requireValidChatTokenAuth(req, session_id, db);
    }
    let session = await fetchChatSession(session_id, db);
    if (!session) {
      throw new InvalidChatSessionError();
    }
    let messages = await fetchLastChatMessages({
      session_id, limit, until, db_client: db, is_admin: has_admin,
    });
    let last_suggestions = undefined; // TODO
    return { messages, last_suggestions };
  });
  return res.status(200).json(ret);
});

apiRouter.use(adminRoutes);

export default apiRouter;
