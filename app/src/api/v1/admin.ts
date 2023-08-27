import { dot, norm } from "lib/vectools";
import getConfigStore from "db/config";
import { OpenAIEmbeddingModel } from "lib/llm/openai";
import Router from "lib/promise_router";
import { APIError, APIValidationError } from "../basics";
import { requireAdminAuth } from "../auth_basics";
import client_tags from "db/client_tag";
import { withDBClient, Client as DBClient } from "db/index";
import { MsgType } from "db/enums";
import { deleteDialogueItem, editMsgAddNewChild, editMsgUpdateDialogueItem, fetchDialogueChildren, fetchDialogueItem, fetchMessageEditedDialogueItem, listAllRoot, tracePrevReplyMsgDialoguePath } from "lib/dialogue_items";
import { DialogueItemInput, InspectLastEditResult } from "./types";
import { ItemsMatchTree, getCachedMatcher } from "lib/match_dialogue";
import { ItemsMatchTreeWithText, listSessions, reconstrucMessageMatchResult } from "lib/chat";
import { fetchSuggestions } from "lib/chat_suggestions";

const apiRouter = Router();

apiRouter.use(requireAdminAuth);

apiRouter.get("/debug-embeddings", async (req, res) => {
  const params = req.query as any;
  const model_name = params.model;
  let inputs = params.input;
  if (typeof inputs === "string") {
    inputs = [inputs];
  }
  let total_tokens = 0;
  const abortController = new AbortController();
  let model = new OpenAIEmbeddingModel(model_name);
  try {
    const embeddings = await Promise.all(inputs.map(async input => {
      const res = await model.getEmbeddings(input, {}, abortController.signal);
      total_tokens += res.total_tokens;
      return res.embedding;
    }));
    const norms = embeddings.map(e => norm(e));
    const similarities = [1];
    for (let i = 1; i < embeddings.length; i += 1) {
      similarities.push(dot(embeddings[0], embeddings[i]) / (norms[0] * norms[i]));
    }
    res.json({
      embeddings, similarities, total_tokens,
    });
  } catch (e) {
    abortController.abort();
    throw e;
  }
});

apiRouter.get("/global-config", async (req, res) => {
  const config_store = await getConfigStore();
  res.set("ETag", `"${config_store.config_id}"`);
  res.json(config_store.config);
});

apiRouter.put("/global-config", async (req, res) => {
  const config_store = await getConfigStore();
  const new_config = req.body;
  let if_match = undefined;
  if (req.get("If-Match")) {
    let if_match_hdr = req.get("If-Match")!;
    if (!/^"[A-Za-z0-9]+"$/.test(if_match_hdr)) {
      throw new APIValidationError("Invalid If-Match header");
    }
    if_match = if_match_hdr.slice(1, -1);
  }
  let update_res = await config_store.updateConfig(new_config, if_match);
  if (update_res) {
    res.status(204).send();
  } else {
    res.status(412).send();
  }
});

export async function checkMessageValidForEdit(message_id: string, db: DBClient): Promise<void> {
  let { rows }: { rows: any[] } = await db.query({
    text: "select msg_type from chat_message where id = $1",
    values: [message_id],
  });
  if (rows.length == 0) {
    throw new APIError(404, "Message not found");
  }
  if (rows[0].msg_type != MsgType.Bot) {
    throw new APIError(400, "Message is not a bot message");
  }
}

apiRouter.get("/messages/:msg_id/inspect-last-edit", async (req, res) => {
  const message_id = req.params.msg_id;
  let ret = await withDBClient<InspectLastEditResult>(async db => {
    await checkMessageValidForEdit(message_id, db);
    let maybe_dialogue_item = await fetchMessageEditedDialogueItem(message_id, db);
    if (maybe_dialogue_item) {
      return {
        edited: true,
        updated_dialogue_item: maybe_dialogue_item
      }
    } else {
      return {
        edited: false,
        prev_reply_path: await tracePrevReplyMsgDialoguePath(message_id, db)
      }
    }
  });
  res.json(ret);
});

apiRouter.get("/messages/:msg_id/reply-analysis", async (req, res) => {
  const message_id = req.params.msg_id;
  let match_result: any = {
    available: false
  };
  let suggestions = [];
  await withDBClient(async db => {
    let reconst_match_res = await reconstrucMessageMatchResult(message_id, db);
    if (reconst_match_res) {
      match_result.available = true;
      match_result.has_missing_items = reconst_match_res.has_missing_items;
      match_result.has_missing_phrasings = reconst_match_res.has_missing_phrasings;
      function dfsMapNode(node: ItemsMatchTreeWithText): any {
        return {
          this_item: node.this_item.dialogue_item_id,
          selected_phrasing: node.q_text,
          response: node.response,
          max_score: node.max_score,
          children: node.children.map(dfsMapNode),
        };
      }
      match_result.match_trees = reconst_match_res.match_trees.map(dfsMapNode);
    }

    suggestions = await fetchSuggestions(message_id, db);
  });
  return res.json({
    match_result,
    suggestions,
  });
});

apiRouter.put("/messages/:msg_id/edit-bot", async (req, res) => {
  const client_tag = req.body.client_tag;
  const tag_entry = await client_tags.checkTag(client_tag);
  if (tag_entry) {
    res.status(204).send();
  }
  const message_id = req.params.msg_id;
  const update_item_id = req.body.item_id;
  const insert_parent_id = req.body.parent_id;
  const has_insert = insert_parent_id !== undefined;
  if (update_item_id && has_insert) {
    throw new APIValidationError("Only one of item_id and parent_id can be specified");
  }
  if (!update_item_id && !has_insert) {
    throw new APIValidationError("Either item_id or parent_id (can be null) must be specified");
  }
  const item_data: DialogueItemInput = {
    phrasings: req.body.phrasings,
    reply: req.body.reply,
  };
  await withDBClient(async db => {
    await db.query("begin transaction isolation level serializable");
    try {
      await checkMessageValidForEdit(message_id, db);
      if (has_insert) {
        await editMsgAddNewChild(message_id, insert_parent_id, item_data, db);
      } else {
        await editMsgUpdateDialogueItem(message_id, update_item_id, item_data, db);
      }
      await db.query("commit");
      await client_tags.setTag(client_tag, null, null);
    } finally {
      await db.query("rollback");
    }
  });
  res.status(204).send();
});

apiRouter.get("/dialogue-item/:item_id", async (req, res) => {
  const item_id = req.params.item_id;
  let ret = await withDBClient(async db => {
    let item_data = await fetchDialogueItem(item_id, db);
    let children = await fetchDialogueChildren(item_id, db);
    return {
      id: item_id,
      item_data,
      children
    };
  });
  res.json(ret);
});

apiRouter.get("/list-dialogue-items", async (req, res) => {
  const result = await listAllRoot();
  res.json(result);
});

apiRouter.delete("/dialogue-item/:item_id", async (req, res) => {
  const item_id = req.params.item_id;
  let recursive = false;
  if (req.query.recursive) {
    recursive = true;
  }
  await withDBClient(async db => {
    await db.query("begin transaction isolation level serializable");
    try {
      await deleteDialogueItem(item_id, recursive, db);
      await db.query("commit");
    } finally {
      await db.query("rollback");
    }
  });
  res.status(204).send();
});

apiRouter.get("/list-chat-sessions", async (req, res) => {
  const limit = (req.query.limit === undefined) ? 1000 : parseInt(req.query.limit as string);
  const until = req.query.until as string | undefined;
  let ret = await listSessions(limit, until, 6);
  res.json(ret);
});

export default apiRouter;
