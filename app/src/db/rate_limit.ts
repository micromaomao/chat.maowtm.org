import { withDBClient, Client as DBClient } from ".";
import { escapeLiteral } from "pg"
import type { Response } from "express";

export interface RateLimitBumpResponse {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
  reset_remaining_secs: number;
}

export class RateLimit {
  constructor(
    public readonly key: string,
    public limit: number,
    public reset_period: number,
  ) {
    if (limit <= 0 || reset_period <= 0) {
      throw new Error("Invalid rate limit configuration");
    }
  }

  /**
   * If `http_res` is provided, will attach RateLimit-* headers to it.
   */
  public async bump(db?: DBClient, http_res?: Response): Promise<RateLimitBumpResponse> {
    if (!db) {
      return await withDBClient(db => this.bump(db));
    }
    let reset_period = this.reset_period;
    if (typeof reset_period != "number") {
      throw new Error("Assertion failed");
    }
    await db.query({
      text: `update rate_limit_state
        set last_reset = now(), count = 0
        where
          key = $1 and
          last_reset <= now() - '${reset_period} seconds'::interval`,
      values: [this.key]
    });
    let { rows }: { rows: any[] } = await db.query({
      text:
        `insert into rate_limit_state as old (key, last_reset, count)
          values ($1, now(), 1)
          on conflict (key) do update set
            count = old.count + 1
          returning last_reset, count, now() as db_now`,
      values: [this.key]
    });
    if (rows.length == 0) {
      throw new Error("Assertion failed: no rows returned from insert");
    }
    let last_reset: Date = rows[0].last_reset;
    let count: number = rows[0].count;
    let remaining = this.limit - count;
    if (remaining < 0) {
      remaining = 0;
    }
    let reset = new Date(last_reset.getTime() + this.reset_period * 1000);
    let db_now: Date = rows[0].db_now; // Prevent weird clock skew issues
    let reset_remaining_secs = Math.floor((reset.getTime() - db_now.getTime()) / 1000);
    if (reset_remaining_secs < 0) {
      reset_remaining_secs = 0;
    }
    let ret: RateLimitBumpResponse = {
      limit: this.limit,
      success: count <= this.limit,
      remaining,
      reset,
      reset_remaining_secs,
    };
    if (http_res) {
      let existing_rem = parseInt(http_res.get("RateLimit-Remaining"));
      if (Number.isNaN(existing_rem) || existing_rem > remaining) {
        http_res
          .set("RateLimit-Limit", this.limit.toString())
          .set("RateLimit-Remaining", remaining.toString())
          .set("RateLimit-Reset", reset_remaining_secs.toString());
      }
    }
    return ret;
  }
}
