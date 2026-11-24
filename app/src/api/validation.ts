import { Validator, Schema } from "@cfworker/json-schema";
import type { MiddlewareHandler } from "hono";
import apiSpec from "../../../api.json";
import type { Env } from "../env";
import { APIValidationError } from "./basics";
import type { Config } from "../db/config";
import { promptBudget } from "../lib/prompt_budget";
import { estimateTokens } from "../lib/llm/models";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const result = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "nullable").map(([key, value]) => [key, normalize(value)]));
  if (record.nullable === true) return { anyOf: [result, { type: "null" }] };
  return result;
}

function validator(schema: unknown): Validator {
  return new Validator(normalize({ ...schema as object, components: apiSpec.components }) as Schema, "7");
}

function check(schema: unknown, value: unknown, label: string): void {
  const result = validator(schema).validate(value);
  if (!result.valid) {
    throw new APIValidationError(`${label}: ${result.errors.map(error => error.error).join("; ")}`);
  }
}

const methods = new Set(["get", "post", "put", "delete", "patch"]);
const endpoints = Object.entries(apiSpec.paths).flatMap(([path, entry]) =>
  Object.entries(entry).filter(([method]) => methods.has(method)).map(([method, operation]) => ({
    method: method.toUpperCase(),
    pattern: new RegExp("^" + path.replace(/\{[^}]+\}/g, "([^/]+)") + "$"),
    operation,
  }))
);

export const validateRequest: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const path = c.req.path.replace(/^\/api\/v1/, "");
  const endpoint = endpoints.find(endpoint => endpoint.method === c.req.method && endpoint.pattern.test(path));
  if (!endpoint) return next();
  const operation = endpoint.operation as {
    parameters?: { in: string; name: string; required?: boolean; schema: Schema }[];
    requestBody?: { required?: boolean; content?: Record<string, { schema?: Schema }> };
  };
  for (const param of operation.parameters || []) {
    if (param.in !== "query") continue;
    const raw = c.req.queries(param.name);
    if (!raw) {
      if (param.required) throw new APIValidationError(`Missing query parameter: ${param.name}`);
      continue;
    }
    let value: unknown = raw[0];
    if (param.schema.type === "array") value = raw;
    if (param.schema.type === "integer") value = /^\d+$/.test(raw[0]) ? Number(raw[0]) : raw[0];
    if (param.schema.type === "boolean") value = raw[0] === "true" ? true : raw[0] === "false" ? false : raw[0];
    check(param.schema, value, param.name);
  }
  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema) {
    const text = await c.req.raw.clone().text();
    if (!text && operation.requestBody.required) throw new APIValidationError("Missing request body");
    if (text) {
      if (!c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) {
        throw new APIValidationError("Content-Type must be application/json");
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new APIValidationError("Invalid JSON body");
      }
      check(bodySchema, body, "Request body");
    } else check(bodySchema, {}, "Request body");
  }
  await next();
};

export function validateConfig(value: unknown): asserts value is Config {
  const model: Schema = {
    type: "object", required: ["type", "name", "config"],
    properties: {
      type: { const: "workers-ai" },
      name: { type: "string", pattern: "^@cf/" },
      config: { type: "object" },
    },
  };
  check({
    type: "object",
    required: ["embedding_model", "generation_model", "init_messages", "prompt_template", "allow_new_session", "allow_new_chat", "global_rate_limit"],
    properties: {
      embedding_model: model,
      generation_model: {
        ...model,
        required: [...model.required, "total_token_limit", "max_sample_tokens", "history_limit", "reserve_token_count"],
        properties: {
          ...model.properties,
          total_token_limit: { type: "integer", minimum: 1024 },
          max_sample_tokens: { type: "integer", minimum: 0 },
          history_limit: { type: "integer", minimum: 1, maximum: 1000 },
          reserve_token_count: { type: "integer", minimum: 1 },
        },
      },
      init_messages: {
        type: "array", items: {
          type: "array", minItems: 2, maxItems: 2,
          items: [{ type: "integer", enum: [0, 1, 2] }, { type: "string", minLength: 1 }],
        },
      },
      prompt_template: { type: "string" },
      allow_new_session: { type: "boolean" },
      allow_new_chat: { type: "boolean" },
      global_rate_limit: {
        type: "array", items: {
          type: "object", required: ["limit", "reset_period"],
          properties: {
            limit: { type: "integer", minimum: 1 },
            reset_period: { type: "integer", minimum: 1 },
          },
        },
      },
    },
  }, value, "Configuration");
  const config = value as Config;
  if (config.prompt_template.split("<|DIALOGUE_ITEMS|>").length !== 2) {
    throw new APIValidationError("Prompt must contain exactly one <|DIALOGUE_ITEMS|> placeholder");
  }
  if (estimateTokens(config.prompt_template) + config.generation_model.max_sample_tokens + 400 >= promptBudget(config.generation_model)) {
    throw new APIValidationError("Prompt and RAG budget must leave room for user messages, output, and context headroom");
  }
}
