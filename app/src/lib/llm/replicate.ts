import Replicate from "replicate"
import { ChatHistoryInput, LLMBase, LLMCOmpletionOutput, LLMChatCompletionInput, TelemetryInfo } from "./base";
import { input2log } from "lib/utils";

const API_KEY = process.env.REPLICATE_API_KEY;

let replicate = new Replicate({
  auth: API_KEY,
});

interface ReplicateConfig {
  model_id: string;
}

interface ReplicateLLAMAConfig extends ReplicateConfig {
  max_new_tokens: number;
  min_new_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;
  repetition_penalty_sustain: number;
  token_repetition_penalty_decay: number;
}

export class ReplicateLLAMA extends LLMBase {
  static supportsChatCompletion = true;
  static supportsEmbedding = false;

  config: ReplicateLLAMAConfig;
  constructor(model_name: string, config: ReplicateConfig) {
    super(model_name, config)
  }

  async countTokens(text: string, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<number> {
    // unimplemented
    return Math.ceil(text.length / 3);
  }

  dialogueToPrompt(sample: ChatHistoryInput): string {
    return sample.map(msg => {
      if (msg.role == "bot") {
        return `${msg.text}`;
      } else {
        return `[INST] ${msg.text} [/INST]`;
      }
    }).join("\n");
  }

  async chatCompletion(input: LLMChatCompletionInput, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<LLMCOmpletionOutput> {
    let prompt = this.dialogueToPrompt(input.chat_history);
    console.log(`Replicate run { model: ${this.config.model_id}, prompt: ${input2log(prompt)}}`);
    const output = await replicate.run(this.config.model_id as any, {
      input: {
        ...this.config,
        prompt: prompt,
        system_prompt: input.instruction_prompt,
      },
      signal: abortSignal,
      wait: {
        interval: 1000,
        max_attempts: 30,
      }
    }) as string[];
    return {
      text: output.join(''),
    };
  }
}