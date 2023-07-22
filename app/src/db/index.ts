import * as pg from "pg";
import { readFileSync } from "fs";
import * as path from "path";

function read_to_string(filename: string): string {
  const filepath = path.join(__dirname, filename);
  return readFileSync(filepath, { encoding: "utf8" });
}

const INIT_SQL = read_to_string("client_init.sql");
const DROP_EVERYTHING_SQL = read_to_string("drop_everything.sql");
const SCHEMA_SQL = read_to_string("schema.sql");

const APPLICATION_DB_VERSION = 1;

let pg_pool = null;

export async function populate_db(client: pg.Client) {
  if (process.env.NODE_ENV == "development") {
    console.log("In development mode - dropping everything beforehand...");
    await client.query(DROP_EVERYTHING_SQL);
  }
  try {
    console.log("Start creating schema...");
    await client.query(SCHEMA_SQL);
    console.log(`Schema created.`);
  } catch (err) {
    console.error("Failed to populate database:", err.message);
    throw err;
  }
}

export async function init() {
  const url = process.env.POSTGRESQL_URL;
  if (!url) {
    throw new Error("Missing POSTGRESQL_URL");
  }
  const hostname = new URL(url).hostname;
  pg_pool = new pg.Pool({
    connectionString: url
  });
  pg_pool.on("connect", async client => {
    client.on("notice", msg => {
      console.warn("PostgreSQL notice:", msg.message);
    });
    await client.query(INIT_SQL);
  });

  const client = await pg_pool.connect();

  try {
    console.log(`Connected to PostgreSQL @ ${hostname}`);

    let rows;
    try {
      rows = (await client.query("select * from db_migration_state;")).rows;
    } catch (err) {
      console.error("Failed to load migration state from database:", err.message);
      console.log("Populating database...");
      await populate_db(client);
      rows = (await client.query("select * from db_migration_state;")).rows;
    }
    if (rows.length != 1) {
      throw new Error("db_migration_state table must have exactly one row.");
    }
    const { db_compat_version: db_version } = rows[0];
    if (db_version != APPLICATION_DB_VERSION) {
      throw new Error(`Database version mismatch: expected ${APPLICATION_DB_VERSION}, got ${db_version}. Database migrations required.`);
    }
  } finally {
    client.release();
  }
}

export async function with_db_client<R, F extends (client: pg.Client) => Promise<R>>(f: F): Promise<R> {
  if (!pg_pool) {
    throw new Error("Database not initialized");
  }
  const client = await pg_pool.connect();
  try {
    return await f(client);
  } finally {
    client.release();
  }
}
