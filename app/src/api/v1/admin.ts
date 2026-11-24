import { Hono } from "hono";
import type { Env } from "../../env";
import { dot } from "lib/vectools";
import getConfigStore from "db/config";
import { WorkersAIModel } from "lib/llm/workers_ai";
import { APIError, APIValidationError } from "../basics";
import { requireAdminAuth, sameOrigin } from "../auth_basics";
import client_tags from "db/client_tag";
import { withDBClient, Client as DBClient } from "db/index";
import { MsgType } from "db/enums";
import { deleteDialogueItem, editMsgAddNewChild, editMsgUpdateDialogueItem, fetchDialogueChildren, fetchDialogueItem, fetchMessageEditedDialogueItem, listAllRoot, tracePrevReplyMsgDialoguePath } from "lib/dialogue_items";
import { DialogueItemInput, InspectLastEditResult } from "./types";
import { ItemsMatchTreeWithText, listSessions, reconstrucMessageMatchResult } from "lib/chat";
import { fetchSuggestions } from "lib/chat_suggestions";
import { getMetrics } from "lib/metrics";
import { validateConfig } from "../validation";
import { estimateTokens } from "lib/llm/models";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAdminAuth);

app.get("/debug-embeddings", async c => {
  const model = new WorkersAIModel(c.env.AI, c.req.query("model"));
  if (!model.model_name.startsWith("@cf/")) throw new APIValidationError("Use a Workers AI model ID");
  const inputs = c.req.queries("input");
  const embeddings = await model.getEmbeddingsBatch(inputs);
  const total_tokens = inputs.reduce((sum, input) => sum + estimateTokens(input), 0);
  return c.json({
    embeddings,
    similarities: embeddings.map((vector, index) => index === 0 ? 1 : dot(embeddings[0], vector)),
    total_tokens,
  });
});

app.post("/debug-embeddings", async c => {
  sameOrigin(c);
  const body = await c.req.json<{ model: string; input: string[] }>();
  if (body.input.some(text => estimateTokens(text) > 7900)) {
    throw new APIValidationError("Embedding input exceeds the safe 8k context budget");
  }
  const model = new WorkersAIModel(c.env.AI, body.model);
  return c.json({ data: await model.getEmbeddingsBatch(body.input) });
});

app.get("/global-config", async c => {
  const store = await getConfigStore();
  c.header("ETag", `"${store.config_id}"`);
  return c.json(store.config);
});

app.put("/global-config", async c => {
  sameOrigin(c);
  const config: unknown = await c.req.json();
  validateConfig(config);
  const header = c.req.header("If-Match");
  if (header && !/^"[A-Za-z0-9]+"$/.test(header)) throw new APIValidationError("Invalid If-Match header");
  const updated = await (await getConfigStore()).updateConfig(config, header?.slice(1, -1));
  return c.body(null, updated ? 204 : 412);
});

export async function checkMessageValidForEdit(message: string, db: DBClient): Promise<void> {
  const { rows } = await db.query("select msg_type from chat_message where id = $1", [message]);
  if (!rows.length) throw new APIError(404, "Message not found");
  if (rows[0].msg_type !== MsgType.Bot) throw new APIValidationError("Message is not a bot message");
}

app.get("/messages/:msg_id/inspect-last-edit", async c => {
  const message = c.req.param("msg_id");
  const result = await withDBClient<InspectLastEditResult>(async db => {
    await checkMessageValidForEdit(message, db);
    const edited = await fetchMessageEditedDialogueItem(message, db);
    return edited ? { edited: true, updated_dialogue_item: edited } :
      { edited: false, prev_reply_path: await tracePrevReplyMsgDialoguePath(message, db) };
  });
  return c.json(result);
});

app.get("/messages/:msg_id/reply-analysis", async c => {
  const message = c.req.param("msg_id");
  return c.json(await withDBClient(async db => {
    const result = await reconstrucMessageMatchResult(message, db);
    function map(node: ItemsMatchTreeWithText): object {
      return {
        this_item: node.this_item.dialogue_item_id, selected_phrasing: node.q_text,
        response: node.response, max_score: node.max_score, children: node.children.map(map),
      };
    }
    return {
      match_result: result ? {
        available: true, has_missing_items: result.has_missing_items,
        has_missing_phrasings: result.has_missing_phrasings, match_trees: result.match_trees.map(map),
      } : { available: false },
      suggestions: await fetchSuggestions(message, db),
    };
  }));
});

export async function editBotMessage(request: Request, message: string, db: DBClient): Promise<void> {
  const body: { client_tag?: string; item_id?: string; parent_id?: string; phrasings: string[]; reply: string } = await request.json();
  const scope = `edit:${message}`;
  if (await client_tags.checkTag(body.client_tag, scope)) return;
  const hasInsert = body.parent_id !== undefined;
  if (!!body.item_id === hasInsert) throw new APIValidationError("Specify exactly one of item_id and parent_id (which can be null)");
  const data: DialogueItemInput = { phrasings: body.phrasings, reply: body.reply };
  await checkMessageValidForEdit(message, db);
  if (hasInsert) await editMsgAddNewChild(message, body.parent_id, data, db);
  else await editMsgUpdateDialogueItem(message, body.item_id, data, db);
  await client_tags.setTag(body.client_tag, null, scope);
}

app.get("/dialogue-item/:item_id", async c => {
  const id = c.req.param("item_id");
  return c.json(await withDBClient(async db => ({
    id, item_data: await fetchDialogueItem(id, db), children: await fetchDialogueChildren(id, db),
  })));
});

app.get("/list-dialogue-items", async c => c.json(await listAllRoot()));
app.delete("/dialogue-item/:item_id", async c => {
  sameOrigin(c);
  await withDBClient(async db => {
    await db.query("begin");
    try {
      await deleteDialogueItem(c.req.param("item_id"), c.req.query("recursive") === "true", db);
      await db.query("commit");
    } finally {
      await db.query("rollback");
    }
  });
  return c.body(null, 204);
});
app.get("/list-chat-sessions", async c => c.json(await listSessions(Number(c.req.query("limit") || 1000), c.req.query("until"), 6)));
app.get("/metrics", async c => c.json(await getMetrics()));

export default app;
