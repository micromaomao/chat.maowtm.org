import { AsyncLocalStorage } from "node:async_hooks";
import type { Client } from "pg";
import type { ConfigStore } from "./db/config";
import type { Env } from "./env";
import type { SessionEvent } from "./db/mq";

interface Runtime {
  env: Env;
  client?: Client;
  config?: Promise<ConfigStore>;
  events: SessionEvent[];
}

const storage = new AsyncLocalStorage<Runtime>();

export function runtime(): Runtime {
  const context = storage.getStore();
  if (!context) {
    throw new Error("Worker request context is not initialized");
  }
  return context;
}

export function withRuntime<T>(env: Env, fn: () => Promise<T>): Promise<T> {
  return storage.run({ env, events: [] }, fn);
}

export function withClient<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...runtime(), client }, fn);
}
