import Router from "lib/promise_router";
import * as OpenApiValidator from "express-openapi-validator";
import apiSpec from "../../../../api.json";
import adminRoutes from "./admin";
import client_tags from "db/client_tag";
import { NewChatMessageEvent, addChatMessage, fetchLastChatMessages, newChatSssion, userNewChatPreCheck, userNewSessionPreCheck } from "lib/chat";
import { withDBClient } from "db/index";
import { InvalidChatSessionError, hasValidAdminAuth, requireValidChatTokenAuth, requireValidChatTokenOrAdmin } from "../basic"
import { MsgType } from "db/enums";
import getConfigStore from "db/config";
import * as mq from "db/mq"
import { ChatSessionEvent, ChatSessionEventType } from "db/mq";
import { msgTypeToStr } from "./types";
import { NewChatSuggestionEvent, fetchSuggestions } from "lib/chat_suggestions";

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
  await userNewSessionPreCheck();
  const ret = await newChatSssion();
  await client_tags.setTag(client_tag, ret);
  res.status(201).json(ret);
});

apiRouter.get("/chat-session/:session_id", async (req, res) => {
  const session_id = req.params.session_id;
  const limit = (req.query.limit === undefined) ? 1000 : parseInt(req.query.limit as string);
  const until = req.query.until as string | undefined;
  let has_admin = await hasValidAdminAuth(req);
  let ret = await withDBClient(async db => {
    let session = await requireValidChatTokenOrAdmin(req, session_id, db);
    if (!session) {
      throw new InvalidChatSessionError();
    }
    let messages = await fetchLastChatMessages({
      session_id, limit, until, db_client: db,
    });
    let last_suggestions = undefined;
    if (messages.length > 0) {
      let msg_id = messages[messages.length - 1].id;
      let arr = await fetchSuggestions(msg_id);
      if (arr.length > 0) {
        last_suggestions = {
          reply_msg: msg_id,
          suggestions: arr
        };
      }
    }
    if (!has_admin) {
      for (let msg of messages) {
        if (msg.metadata) {
          msg.metadata.updated_before = false;
        }
      }
    }
    return { messages, last_suggestions };
  });
  return res.status(200).json(ret);
});

apiRouter.get("/chat-session/:session_id/stream", async (req, res) => {
  const session_id = req.params.session_id;
  let session = await requireValidChatTokenOrAdmin(req, session_id);
  if (!session) {
    throw new InvalidChatSessionError();
  }

  let closed = false;
  async function listener(_msg: ChatSessionEvent) {
    if (closed) {
      return;
    }
    let client_msg: [string, any] | null = null;
    if (_msg._event == ChatSessionEventType.NewChatMessage) {
      let msg = _msg as NewChatMessageEvent;
      client_msg = ["message", {
        id: msg.id,
        session: msg.session_id,
        msg_type: msgTypeToStr(msg.msg_type),
        content: msg.content,
        client_tag: msg.client_tag || await client_tags.ulidToTag(msg.id),
        metadata: {
          updated_before: false,
          user_feedback: 0
        }
      }];
    } else if (_msg._event == ChatSessionEventType.NewSuggestions) {
      let msg = _msg as NewChatSuggestionEvent;
      client_msg = ["suggestions", {
        reply_msg: msg.reply_msg,
        suggestions: msg.suggestions,
      }];
    }
    if (closed || !client_msg) {
      return;
    }
    res.write(`event: ${client_msg[0]}\ndata: ${JSON.stringify(client_msg[1])}\n\n`);
  }

  res.on("close", () => {
    if (closed) {
      return;
    }
    closed = true;
    res.end();
    mq.queue.off(session_id, listener);
  });
  mq.queue.on(session_id, listener);

  res.status(200).type("text/event-stream");
  res.flushHeaders();

  let ping_interval = setInterval(() => {
    if (closed) {
      clearInterval(ping_interval);
      return;
    }
    res.write('event: ping\ndata: "ping"\n\n');
  }, 5000);
});

apiRouter.post("/chat-session/:session_id/send-chat", async (req, res) => {
  const session_id = req.params.session_id;
  const client_tag = req.body.client_tag;
  const tag_entry = await client_tags.checkTag(client_tag);
  if (tag_entry) {
    res.status(200).type("text").send(tag_entry.response);
    return;
  }
  let conf_store = await getConfigStore();
  let msg = await withDBClient(async db => {
    await requireValidChatTokenAuth(req, session_id, db);
    await userNewChatPreCheck(session_id, db);
    const content = req.body.message;
    let msg = await addChatMessage({
      session_id,
      msg_type: MsgType.User,
      content,
      generation_model: conf_store.generation_model.model_name,
      client_tag,
    }, db);
    let msg_id = msg.id;
    await client_tags.setTag(client_tag, msg_id, msg_id);
    return msg;
  });
  res.status(200).type("text").send(msg.id);
})

apiRouter.use(adminRoutes);

export default apiRouter;
