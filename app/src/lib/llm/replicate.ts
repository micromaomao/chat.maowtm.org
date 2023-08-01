import Replicate from "replicate"
import { ChatHistoryInputLine, LLMBase, LLMCOmpletionOutput, LLMChatCompletionInput, TelemetryInfo } from "./base";
import { asyncSleep, input2log } from "lib/utils";

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


  dialogueToPrompt({ role, text }: ChatHistoryInputLine): string {
    if (role == "bot") {
      return `${text}`;
    } else {
      return `[INST] ${text} [/INST]`;
    }
  }

  async chatCompletion(input: LLMChatCompletionInput, telemetry: TelemetryInfo, abortSignal?: AbortSignal): Promise<LLMCOmpletionOutput> {
    let prompt = input.chat_history.map(l => this.dialogueToPrompt(l)).join("\n");
    console.log(`Replicate run { model: ${this.config.model_id}, prompt: ${input2log(prompt)}}`);
    let prediction = await replicate.predictions.create({
      version: this.config.model_id.replace(/^[^:]+:/, ""),
      input: {
        ...this.config,
        prompt: prompt,
        system_prompt: input.instruction_prompt,
      }
    });
    function cancelPrediction() {
      replicate.predictions.cancel(prediction.id).catch(err => {
        console.error("Failed to cancel replicate prediction: ", err);
      });
    }
    let attempts = 0;
    try {
      while (prediction.status == "starting" || prediction.status == "processing") {
        attempts += 1;
        if (abortSignal?.aborted) {
          cancelPrediction();
          throw new Error("aborted");
        }
        if (attempts > 180) {
          cancelPrediction();
          throw new Error("Prediction timed out");
        }
        await asyncSleep(1000);
        prediction = await replicate.predictions.get(prediction.id);
        console.info(`Replicate prediction ${prediction.id} status: ${prediction.status}`);
      }
    } finally {
      if (prediction.status == "starting" || prediction.status == "processing") {
        cancelPrediction();
      }
    }
    if (prediction.status == "failed") {
      throw new Error(`Replicate prediction failed: ${prediction.error}`);
    }
    if (prediction.status != "succeeded") {
      throw new Error(`Replicate prediction status is ${prediction.status}`);
    }
    return {
      text: prediction.output.join(''),
    };
  }
}
