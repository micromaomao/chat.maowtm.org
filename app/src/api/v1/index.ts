import Router from "lib/promise_router";
import * as OpenApiValidator from "express-openapi-validator";
import apiSpec from "../../../../api.json";
import adminRoutes from "./admin";
import client_tags from "db/client_tag";
import { addChatMessage, fetchLastChatMessages, newChatSssion } from "lib/chat";
import { withDBClient } from "db/index";
import { InvalidChatSessionError, hasValidAdminAuth, requireValidChatTokenAuth, requireValidChatTokenOrAdmin } from "../basic"
import { MsgType } from "db/enums";
import getConfigStore from "db/config";

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

apiRouter.get("/chat-session/:session_id", async (req, res) => {
  const session_id = req.params.session_id;
  const limit = (req.query.limit === undefined) ? 1000 : parseInt(req.query.limit as string);
  const until = req.query.until as string | undefined;
  let ret = await withDBClient(async db => {
    let session = await requireValidChatTokenOrAdmin(req, session_id, db);
    if (!session) {
      throw new InvalidChatSessionError();
    }
    const has_admin = await hasValidAdminAuth(req);
    let messages = await fetchLastChatMessages({
      session_id, limit, until, db_client: db, is_admin: has_admin,
    });
    let last_suggestions = undefined; // TODO
    return { messages, last_suggestions };
  });
  return res.status(200).json(ret);
});

apiRouter.post("/chat-session/:session_id/send-chat", async (req, res) => {
  const session_id = req.params.session_id;
  const client_tag = req.body.client_tag;
  const tag_entry = await client_tags.checkTag(client_tag);
  if (tag_entry) {
    res.status(200).type("text").send(tag_entry.response);
    return;
  }
  const config = (await getConfigStore()).config;
  let msg = await withDBClient(async db => {
    await requireValidChatTokenAuth(req, session_id, db);
    const content = req.body.message;
    // TODO: start transaction and:
    //         check rate limit
    //         check captcha
    return await addChatMessage({
      session_id,
      msg_type: MsgType.User,
      content,
      generation_model: config.generation_model,
    }, db);
  });
  let msg_id = msg.id;
  await client_tags.setTag(client_tag, msg_id, msg_id);
  res.status(200).type("text").send(msg_id);
})

apiRouter.use(adminRoutes);

export default apiRouter;