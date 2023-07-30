import { withDBClient } from ".";
import package_json from "../../package.json";
import * as mq from "./mq";
import * as path from "path";
import { readFileSync } from "fs";
import { MsgType } from "./enums";
import { LLMBase } from "lib/llm/base";
import { chatCompletionModelFromConfig, embeddingModelFromConfig } from "lib/llm/config";

const APP_VERSION = package_json.version;

const DEFAULT_PROMPT_TEMPLATE = readFileSync(path.join(__dirname, "default_prompt_template.txt"), "utf-8");

export interface Model {
  type: string;
  name: string;
  config: object;
}

export interface GenerationModel extends Model {
  total_token_limit: number;
  history_limit: number;
  reserve_token_count: number;
}

export interface Config {
  embedding_model: Model;
  generation_model: GenerationModel;
  init_messages: [MsgType, string][];
  prompt_template: string;
}

export class ConfigStore {
  static async defaultConfig(): Promise<Config> {
    let conf: Config = {
      embedding_model: {
        type: "openai",
        name: "text-embedding-ada-002",
        config: {}
      },
      generation_model: {
        type: "openai",
        name: "gpt-3.5-turbo",
        config: {
          temperature: 0.5,
          top_p: 1
        },
        history_limit: 20,
        total_token_limit: 4096,
        reserve_token_count: 255,
      },
      init_messages: [
        [MsgType.Bot, "Hi, nice to meet you!"],
      ],
      prompt_template: DEFAULT_PROMPT_TEMPLATE,
    };
    return conf;
  }

  private cached_config: Config = null;
  private constructor() { }

  static async createInstance(): Promise<ConfigStore> {
    const store = new ConfigStore();
    await withDBClient(async c => {
      const { rows } = await c.query("select * from global_configuration order by id desc limit 1;");
      if (rows.length == 0) {
        const default_conf = await ConfigStore.defaultConfig();
        await c.query({
          text: "insert into global_configuration (config, app_version) values ($1, $2)",
          values: [default_conf, APP_VERSION]
        });
        store.cached_config = default_conf;
      } else {
        const { config, app_version: stored_version } = rows[0];
        if (typeof config != "object") {
          throw new Error("Expected config to be a JSON object");
        }
        store.cached_config = config;
        if (stored_version != APP_VERSION) {
          // TODO: migrate config
          await c.query({
            text: "insert into global_configuration (config, app_version) values ($1, $2)",
            values: [store.cached_config, APP_VERSION]
          });
        }
      }
    });
    mq.queue.on(mq.MSG_APP_CONFIG_CHANGE, data => {
      store.cached_config = data;
    });
    return store;
  }

  get config(): Config {
    return this.cached_config;
  }

  async updateConfig(new_config: Config) {
    this.cached_config = new_config;
    await withDBClient(async c => {
      await c.query({
        text: "insert into global_configuration (config, app_version) values ($1, $2)",
        values: [new_config, APP_VERSION]
      });
    });
    mq.queue.emit(mq.MSG_APP_CONFIG_CHANGE, new_config);
  }

  get generation_model(): LLMBase {
    return chatCompletionModelFromConfig(this.config.generation_model);
  }

  get embedding_model(): LLMBase {
    return embeddingModelFromConfig(this.config.embedding_model);
  }
}

let cached_store_promise: Promise<ConfigStore> | null = null;

export default function getConfigStore(): Promise<ConfigStore> {
  if (!cached_store_promise) {
    cached_store_promise = ConfigStore.createInstance();
  }
  return cached_store_promise;
}
