import { OpenAPI } from "app/openapi";

export function adminLoadCurrentConfig(): Promise<{ id: string, config: any }> {
  return fetch("/api/v1/global-config", { headers: { ...OpenAPI.HEADERS } }).then(async r => {
    if (r.status != 200) {
      let body = await r.text();
      throw new Error(`Failed to load config: ${r.status} ${r.statusText} - ${body}`);
    } else {
      let config = await r.json();
      let id = r.headers.get("ETag");
      return { id, config };
    }
  });
}

export async function adminUpdateConfig(update_function: (config: any) => any, cached_config?: any, cached_etag?: string): Promise<void> {
  let tries_left = 2;
  if (!cached_config) {
    tries_left = 1;
  }

  let config = cached_config;
  let etag = cached_etag;

  while (tries_left > 0) {
    tries_left -= 1;

    if (!config) {
      let latest = await adminLoadCurrentConfig();
      config = latest.config;
      etag = latest.id;
    }

    let updated_config = update_function(config);

    let res = await fetch("/api/v1/global-config", {
      headers: {
        ...OpenAPI.HEADERS,
        "If-Match": etag,
        "Content-Type": "application/json"
      },
      method: "PUT",
      body: JSON.stringify(updated_config),
    });

    if (res.status == 200 || res.status == 204) {
      return;
    }

    if (res.status == 412 && tries_left >= 1) {
      config = undefined;
      etag = undefined;
      continue;
    }

    let body = await res.text();
    throw new Error(`${res.status} ${res.statusText} ${body}`);
  }
}
