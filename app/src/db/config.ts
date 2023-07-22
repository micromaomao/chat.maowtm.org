import { with_db_client } from ".";
import package_json from "../../package.json";

const APP_VERSION = package_json.version;
const CONFIG_RELOAD_TIMEOUT = 60 * 60 * 1000;

export interface Config {
}

export class ConfigStore {
  static default_config(): Config {
    return {
    };
  }

  cached_config: Config = null;
  config_reload_timer = null;
  last_config_reload_time = null;

  async init() {
    await with_db_client(async c => {
      const { rows } = await c.query("select * from global_configuration order by id desc limit 1;");
      if (rows.length == 0) {
        const default_conf = ConfigStore.default_config();
        await c.query({
          text: "insert into global_configuration (config, app_version) values ($1, $2)",
          values: [default_conf, APP_VERSION]
        });
        this.cached_config = default_conf;
      } else {
        const { config, app_version: stored_version } = rows[0];
        if (typeof config != "object") {
          throw new Error("Expected config to be a JSON object");
        }
        this.cached_config = config;
        if (stored_version != APP_VERSION) {
          // TODO: migrate config
          await c.query({
            text: "insert into global_configuration (config, app_version) values ($1, $2)",
            values: [this.cached_config, APP_VERSION]
          });
        }
      }
    });
    this.last_config_reload_time = Date.now();
    this.start_config_reload_timer();
  }

  get config(): Config {
    if (this.last_config_reload_time < Date.now() - 60000) {
      this.refresh_config(); // don't await here
    }
    return this.cached_config;
  }

  async update_config(new_config: Config) {
    this.cached_config = new_config;
    await with_db_client(async c => {
      await c.query({
        text: "insert into global_configuration (config, app_version) values ($1, $2)",
        values: [new_config, APP_VERSION]
      });
    });
  }

  async refresh_config() {
    if (this.config_reload_timer) {
      clearTimeout(this.config_reload_timer);
      this.config_reload_timer = null;
    }
    await with_db_client(async c => {
      const { rows } = await c.query("select * from global_configuration order by id desc limit 1;");
      if (rows.length == 0) {
        throw new Error("No config found");
      }
      const { config, app_version: stored_version } = rows[0];
      if (stored_version !== APP_VERSION) {
        console.warn("Config version mismatch - server needs to be restarted");
      }
      if (typeof config != "object") {
        throw new Error("Expected config to be a JSON object");
      }
      this.cached_config = config;
    });
    this.last_config_reload_time = Date.now();
    this.start_config_reload_timer();
  }

  start_config_reload_timer() {
    if (this.config_reload_timer) {
      clearTimeout(this.config_reload_timer);
    }
    this.config_reload_timer = setTimeout(() => {
      this.config_reload_timer = null;
      try {
        this.refresh_config();
      } catch (e) {
        throw new Error("Error reloading config: " + e.message);
      }
    }, CONFIG_RELOAD_TIMEOUT);
  }
}

let cached_store_promise = null;

export default function get_config_store(): Promise<ConfigStore> {
  if (!cached_store_promise) {
    const cached_store = new ConfigStore();
    cached_store_promise = cached_store.init().then(() => cached_store);
  }
  return cached_store_promise;
}
