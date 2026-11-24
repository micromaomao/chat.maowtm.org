export interface WorkersAI {
  run(model: string, input: object): Promise<unknown>;
}

export interface Env {
  AI: WorkersAI;
  HYPERDRIVE: Hyperdrive;
  CHAT_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}
