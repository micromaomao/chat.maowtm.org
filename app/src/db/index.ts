import { Client } from "pg";
import { runtime, withClient } from "../runtime";

export { Client };

export async function withDBClient<R>(fn: (client: Client) => Promise<R>): Promise<R> {
  const context = runtime();
  if (context.client) {
    return fn(context.client);
  }
  const client = new Client({
    connectionString: context.env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 10000,
  });
  const eventCount = context.events.length;
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("set time zone 'UTC'");
    return await withClient(client, () => fn(client));
  } catch (error) {
    context.events.splice(eventCount);
    throw error;
  } finally {
    try {
      if (connected) await client.query("rollback");
    } finally {
      await client.end();
    }
  }
}
