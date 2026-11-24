import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "./env";
import api from "./api";
import { APIError, GlobalChatRateLimitExceeded } from "./api/basics";
import { runtime, withRuntime } from "./runtime";

export { ChatSessionObject } from "./session_object";

export function errorResponse(error: Error): Response {
  if (error instanceof APIError) {
    const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
    if (error instanceof GlobalChatRateLimitExceeded) {
      headers["RateLimit-Limit"] = String(error.rateLimitRes.limit);
      headers["RateLimit-Remaining"] = String(error.rateLimitRes.remaining);
      headers["RateLimit-Reset"] = String(error.rateLimitRes.reset_remaining_secs);
      headers["Retry-After"] = headers["RateLimit-Reset"];
    }
    return new Response(error.message, { status: error.status, headers });
  }
  console.error("Request failed", error);
  return new Response("Something broke!", { status: 500 });
}

const app = new Hono<{ Bindings: Env }>();
app.use("/api/*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Cache-Control", "no-store");
  await next();
});
app.use("/api/*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: c => c.text("Request body exceeds 1 MiB", 413),
}));
app.route("/api", api);
app.onError(error => errorResponse(error));
app.notFound(c => c.text("Not found", 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return withRuntime(env, async () => {
      const response = await app.fetch(request, env, ctx);
      if (response.status < 400 && response.status !== 101) {
        const sessions = new Set(runtime().events.map(event => event.session_id));
        for (const session of sessions) {
          const result = await env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(session)).fetch(
            new Request(`https://session/notify/${encodeURIComponent(session)}`, { method: "POST" })
          );
          if (!result.ok) throw new Error("Failed to notify chat session");
        }
      }
      return response;
    });
  },
} satisfies ExportedHandler<Env>;
