import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

export default defineConfig({
  resolve: {
    alias: {
      db: resolve("src/db"),
      lib: resolve("src/lib"),
      app: resolve("src/app"),
    },
  },
  plugins: [
    {
      name: "prompt-text",
      enforce: "pre",
      load(id) {
        if (id.endsWith(".txt")) return `export default ${JSON.stringify(readFileSync(id, "utf8"))}`;
      },
    },
    cloudflareTest({
      main: "./src/worker.ts",
      remoteBindings: false,
      miniflare: {
        compatibilityDate: "2026-11-23",
        compatibilityFlags: ["nodejs_compat"],
        durableObjects: { CHAT_SESSION: "ChatSessionObject" },
        hyperdrives: { HYPERDRIVE: "postgres://test:test@localhost:5432/test" },
        modulesRules: [{ type: "Text", include: ["**/*.txt"] }],
      },
    }),
  ],
  test: { include: ["tests/**/*.test.ts"] },
});
