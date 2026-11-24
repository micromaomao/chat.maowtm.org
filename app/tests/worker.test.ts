import { describe, expect, it, vi } from "vitest";
import { WorkersAIModel, parseEmbeddings } from "../src/lib/llm/workers_ai";
import { budgetHistory } from "../src/lib/prompt_budget";
import { estimateTokens, DEFAULT_CHAT_MODEL } from "../src/lib/llm/models";
import { MsgType } from "../src/db/enums";
import { validateConfig, validateRequest } from "../src/api/validation";
import { defaultConfig } from "../src/db/default_config";
import { generateToken, strToHashBuf } from "../src/lib/secure_token/nodejs";
import { Hono } from "hono";
import type { Env } from "../src/env";
import { exports } from "cloudflare:workers";

describe("Workers AI and safe context budgeting", () => {
  it("maps bot messages to assistant and forwards model settings", async () => {
    const run = vi.fn().mockResolvedValue({ response: "Hello" });
    const model = new WorkersAIModel({ run }, DEFAULT_CHAT_MODEL, { max_tokens: 128 });
    const result = await model.chatCompletion({
      instruction_prompt: "Be helpful",
      chat_history: [{ role: "user", text: "Hi" }, { role: "bot", text: "Hello" }],
    }, {});
    expect(run).toHaveBeenCalledWith(DEFAULT_CHAT_MODEL, {
      max_tokens: 128, stream: false,
      messages: [
        { role: "system", content: "Be helpful" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    });
    expect(result.text).toBe("Hello");
  });

  it("rejects malformed and zero vectors and normalizes valid embeddings", () => {
    expect(parseEmbeddings({ data: [[3, 4]] }, 1)).toEqual([[0.6, 0.8]]);
    expect(() => parseEmbeddings({ data: [[0, 0]] }, 1)).toThrow();
    expect(() => parseEmbeddings({ data: [[NaN, 1]] }, 1)).toThrow();
    expect(() => parseEmbeddings({ data: [[1]] }, 2)).toThrow();
    expect(() => parseEmbeddings({ data: [[1], [1, 2]] }, 2)).toThrow();
  });

  it("embeds a batch with one binding call and preserves input order", async () => {
    const run = vi.fn().mockResolvedValue({ data: [[3, 4], [1, 0]] });
    const model = new WorkersAIModel({ run }, "@cf/qwen/qwen3-embedding-0.6b");
    expect(await model.getEmbeddingsBatch(["first", "second"])).toEqual([[0.6, 0.8], [1, 0]]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("@cf/qwen/qwen3-embedding-0.6b", { text: ["first", "second"] });
  });

  it("does not add an over-budget history message", () => {
    const rows = [
      { id: "3", msg_type: MsgType.User, content: "latest" },
      { id: "2", msg_type: MsgType.Bot, content: "previous ".repeat(30) },
      { id: "1", msg_type: MsgType.User, content: "earlier" },
    ];
    expect(budgetHistory("system", rows, 40).map(line => line.msg_id)).toEqual(["3"]);
    expect(() => budgetHistory("system", rows, 10)).toThrow();
    expect(estimateTokens("\u4f60\u597d")).toBeGreaterThan(estimateTokens("hi"));
  });

  it("does not publish a response after cancellation", async () => {
    const controller = new AbortController();
    const model = new WorkersAIModel({
      run: async () => {
        controller.abort();
        return { response: "Stale response" };
      },
    }, DEFAULT_CHAT_MODEL);
    await expect(model.chatCompletion({ instruction_prompt: "", chat_history: [] }, {}, controller.signal)).rejects.toThrow();
  });
});

describe("Worker authentication and validation", () => {
  it("rejects oversized API bodies before parsing or forwarding them", async () => {
    const response = await exports.default.fetch("https://test/api/v1/chat-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(1024 * 1024 + 1) },
      body: "a".repeat(1024 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    await response.text();
  });
  it("keeps existing token hashing format and rejects malformed encodings", async () => {
    const [token, hash] = await generateToken();
    expect(await strToHashBuf(token)).toEqual(hash);
    expect(await strToHashBuf(token + "!")).toBeNull();
    expect(await strToHashBuf("invalid")).toBeNull();
  });

  it("accepts Workers AI configuration and rejects unsafe budgets and legacy providers", () => {
    const config = defaultConfig("Instructions: <|DIALOGUE_ITEMS|>");
    expect(() => validateConfig(config)).not.toThrow();
    expect(() => validateConfig({ ...config, embedding_model: { type: "openai", name: "old", config: {} } })).toThrow();
    expect(() => validateConfig({
      ...config,
      generation_model: { ...config.generation_model, total_token_limit: 1024 },
    })).toThrow();
  });

  it("validates OpenAPI query arrays, JSON bodies, and nullable edit parents", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use("*", validateRequest);
    app.post("/api/v1/chat-session/:id/send-chat", async c => c.json(await c.req.raw.json()));
    app.all("*", c => c.text("ok"));
    app.onError((error, c) => c.text(error.message, 400));
    expect((await app.request("/api/v1/debug-embeddings?input=a&input=b&model=test")).status).toBe(200);
    expect((await app.request("/api/v1/debug-embeddings?model=test")).status).toBe(400);
    expect((await app.request("/api/v1/chat-session/id?limit=invalid")).status).toBe(400);
    expect((await app.request("/api/v1/messages/id/edit-bot", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: null, phrasings: ["question"], reply: "answer" }),
    })).status).toBe(200);
    expect((await app.request("/api/v1/chat-session/id/send-chat", { method: "POST" })).status).toBe(400);
    const forwarded = await app.request("/api/v1/chat-session/id/send-chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "unchanged" }),
    });
    expect(forwarded.status).toBe(200);
    expect(await forwarded.json()).toEqual({ message: "unchanged" });
  });
});
