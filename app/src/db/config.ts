import { withDBClient, Client as DBClient } from ".";
import package_json from "../../package.json";
import DEFAULT_PROMPT_TEMPLATE from "./default_prompt_template.txt";
import { MsgType } from "./enums";
import { LLMBase } from "lib/llm/base";
import type { WorkersAIModel } from "lib/llm/workers_ai";
import { chatCompletionModelFromConfig, embeddingModelFromConfig } from "lib/llm/config";
import { RateLimit } from "./rate_limit";
import type { RateLimitBumpResponse } from "./rate_limit";
import { APIValidationError, GlobalChatRateLimitExceeded } from "../api/basics";
import { runtime } from "../runtime";
import { defaultConfig } from "./default_config";

export interface Model {
  type: string;
  name: string;
  config: object;
}

export interface GenerationModel extends Model {
  total_token_limit: number;
  max_sample_tokens: number;
  history_limit: number;
  reserve_token_count: number;
}

export type ChatRateLimitConfig = { limit: number; reset_period: number }[];

export interface Config {
  embedding_model: Model;
  generation_model: GenerationModel;
  init_messages: [MsgType, string][];
  prompt_template: string;
  allow_new_session: boolean;
  allow_new_chat: boolean;
  global_rate_limit: ChatRateLimitConfig;
}

export class ConfigStore {
  static async defaultConfig(): Promise<Config> {
    return defaultConfig(DEFAULT_PROMPT_TEMPLATE);
  }

  private constructor(public config: Config, public config_id: string) {}

  static async createInstance(): Promise<ConfigStore> {
    return withDBClient(async db => {
      const { rows } = await db.query("select id, config from global_configuration order by id desc limit 1");
      if (!rows.length) {
        throw new Error("Database configuration is missing. Run npm run db:migrate first.");
      }
      return new ConfigStore(rows[0].config, rows[0].id);
    });
  }

  async updateConfig(config: Config, if_match?: string): Promise<boolean> {
    return withDBClient(async db => {
      await db.query("begin");
      try {
        await db.query("select pg_advisory_xact_lock(42001)");
        const { rows } = await db.query("select id from global_configuration order by id desc limit 1");
        if (if_match !== undefined && rows[0]?.id !== if_match) {
          return false;
        }
        if (config.embedding_model.name !== this.config.embedding_model.name) {
          const missing = await db.query(
            `select count(*)::int as count from dialogue_phrasing p
             left join dialogue_phrasing_embedding e on e.phrasing = p.id and e.model = $1
             where e.phrasing is null or e.source_text is distinct from p.q_text`,
            [config.embedding_model.name]
          );
          if (missing.rows[0].count) {
            throw new APIValidationError("Re-embed all dialogue phrasings before switching embedding models.");
          }
        }
        const result = await db.query(
          "insert into global_configuration (config, app_version) values ($1, $2) returning id",
          [config, package_json.version]
        );
        await db.query("commit");
        this.config = config;
        this.config_id = result.rows[0].id;
        return true;
      } finally {
        await db.query("rollback");
      }
    });
  }

  get generation_model(): LLMBase {
    return chatCompletionModelFromConfig(this.config.generation_model);
  }

  get embedding_model(): WorkersAIModel {
    return embeddingModelFromConfig(this.config.embedding_model);
  }

  async enforceGlobalRateLimit(db?: DBClient): Promise<RateLimitBumpResponse | undefined> {
    if (!db) {
      return withDBClient(db => this.enforceGlobalRateLimit(db));
    }
    let strictest: RateLimitBumpResponse | undefined;
    for (let i = 0; i < this.config.global_rate_limit.length; i++) {
      const { limit, reset_period } = this.config.global_rate_limit[i];
      const result = await new RateLimit(`global_rate_limit[${i}]`, limit, reset_period).bump(db);
      if (!result.success) {
        throw new GlobalChatRateLimitExceeded(result);
      }
      if (!strictest || result.remaining < strictest.remaining) strictest = result;
    }
    return strictest;
  }
}

export default function getConfigStore(): Promise<ConfigStore> {
  const context = runtime();
  if (!context.config) {
    context.config = ConfigStore.createInstance();
  }
  return context.config;
}
