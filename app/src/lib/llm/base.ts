export interface TelemetryInfo {
  session_id?: string;
}

export interface ChatHistoryInputLine {
  role: "user" | "bot";
  text: string;
};

export interface LLMChatCompletionInput {
  instruction_prompt: string;
  chat_history: ChatHistoryInputLine[];
}

export interface LLMCOmpletionOutput {
  text: string;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LLMEmbeddingOutput {
  embedding: number[];
  total_tokens: number;
}

export enum ModerationProvider {
  OpenAI = "OpenAI"
}

export interface CheckModerationResult {
  flagged: boolean;
  flagged_categories?: string[];
  moderation_provider?: ModerationProvider;
}

export abstract class LLMBase {
  static readonly supportsChatCompletion: boolean;
  static readonly supportsEmbedding: boolean;

  constructor(
    public readonly model_name: string,
    public readonly config: object,
  ) { }

  get shouldUseModeration(): boolean {
    return false;
  }

  abstract countTokens(text: string, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<number>;
  chatCompletion(input: LLMChatCompletionInput, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<LLMCOmpletionOutput> {
    throw new Error("chatCompletion not implemented");
  }
  getEmbeddings(text: string, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<LLMEmbeddingOutput> {
    throw new Error("getEmbeddings not implemented");
  }
  dialogueToPrompt({ role, text }: ChatHistoryInputLine): string {
    return `${role == "user" ? "User" : "You"}: ${text}`;
  }
  checkModeration(text: string, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<CheckModerationResult> {
    throw new Error("checkModeration not implemented");
  }
}
