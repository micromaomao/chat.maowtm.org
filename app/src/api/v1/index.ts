import Router from "lib/promise_router";
import * as OpenApiValidator from "express-openapi-validator";
import apiSpec from "../../../../api.json";
import adminRoutes from "./admin";
import client_tags from "db/client_tag";
import { ExcludeSingleMessageEvent, NewChatMessageEvent, addChatMessage, fetchLastChatMessages, fetchSingleMessage, findChatMessageSession, newChatSssion, rollbackChat, userNewChatPreCheck, userNewSessionPreCheck } from "lib/chat";
import { withDBClient } from "db/index";
import { InvalidChatSessionError } from "../basics";
import { hasValidAdminAuth, requireValidChatTokenAuth, requireValidChatTokenOrAdmin } from "../auth_basics";
import { MsgType } from "db/enums";
import getConfigStore from "db/config";
import * as mq from "db/mq"
import { ChatSessionEvent, ChatSessionEventType } from "db/mq";
import { FetchedChatMessage, msgTypeToStr } from "./types";
import { NewChatSuggestionEvent, fetchSuggestions } from "lib/chat_suggestions";
import { MessageEditedEvent } from "lib/dialogue_items";

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
  if (!await hasValidAdminAuth(req)) {
    await userNewSessionPreCheck();
  }
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
  let has_admin = await hasValidAdminAuth(req);

  let closed = false;
  let ping_interval: NodeJS.Timeout | null = null;

  function close() {
    if (closed) return;
    closed = true;
    res.end();
    mq.queue.off(session_id, listener);
    if (ping_interval !== null) {
      clearInterval(ping_interval);
    }
  }

  async function listener(_msg: ChatSessionEvent) {
    if (closed) {
      return;
    }
    try {
      let client_msg: [string, any] | null = null;
      if (_msg._event == ChatSessionEventType.NewChatMessage) {
        let msg = _msg as NewChatMessageEvent;
        let data: FetchedChatMessage = {
          id: msg.id,
          msg_type: msgTypeToStr(msg.msg_type),
          content: msg.content,
          metadata: {
            updated_before: false,
            user_feedback: 0
          },
          exclude_from_generation: false,
          client_tag: msg.client_tag || await client_tags.ulidToTag(msg.id),
        };
        client_msg = ["message", data];
      } else if (_msg._event == ChatSessionEventType.NewSuggestions) {
        let msg = _msg as NewChatSuggestionEvent;
        client_msg = ["suggestions", {
          reply_msg: msg.reply_msg,
          suggestions: msg.suggestions,
        }];
      } else if (_msg._event == ChatSessionEventType.ExcludeSingleMessage) {
        let msg = _msg as ExcludeSingleMessageEvent;
        let updated_msg = await fetchSingleMessage(msg.id);
        updated_msg.exclude_from_generation = true;
        client_msg = ["message", updated_msg];
      } else if (_msg._event == ChatSessionEventType.MessageEdited && has_admin) {
        let msg = _msg as MessageEditedEvent;
        let updated_msg = await fetchSingleMessage(msg.id);
        if (!updated_msg.metadata) {
          throw new Error("Assertion failed: metadata should exist");
        }
        updated_msg.metadata.updated_before = true;
        client_msg = ["message", updated_msg];
      }
      if (closed || !client_msg) {
        return;
      }
      res.write(`event: ${client_msg[0]}\ndata: ${JSON.stringify(client_msg[1])}\n\n`);
    } catch (e) {
      console.error("Error while streaming message:", e);
      close();
    }
  }

  res.on("close", () => {
    close();
  });

  res.status(200).type("text/event-stream");
  res.flushHeaders();

  mq.queue.on(session_id, listener);

  ping_interval = setInterval(() => {
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
    if (!await hasValidAdminAuth(req)) {
      await userNewChatPreCheck(session_id, db);
    }
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

apiRouter.post("/messages/:msg_id/rollback-chat", async (req, res) => {
  const message_id = req.params.msg_id;
  await withDBClient(async db => {
    const session_id = await findChatMessageSession(message_id, db);
    await requireValidChatTokenAuth(req, session_id, db);
    await rollbackChat(session_id, message_id, db);
  });
  res.status(204).send();
});

apiRouter.use(adminRoutes);

export default apiRouter;
