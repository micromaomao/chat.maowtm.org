import { MsgType } from "db/enums";
import { Client as DBClient, withDBClient } from "db/index";

export interface Metrics {
  total_sessions: number;
  total_user_messages: number;
  total_dialogue_items: number;
}

export async function getMetrics(db?: DBClient): Promise<Metrics> {
  if (!db) {
    return await withDBClient(db => getMetrics(db));
  }

  let res: any = {};

  let { rows } = await db.query({
    name: "chats.ts#listSessions#counts",
    text: `
      select
        count(distinct session) as total_sessions,
        count(*) as total_user_messages
      from chat_message
        where msg_type = ${MsgType.User};`
  });
  // type bigint need to be converted to number
  res.total_sessions = parseInt(rows[0].total_sessions);
  res.total_user_messages = parseInt(rows[0].total_user_messages);

  ({ rows } = await db.query({
    text: `
      select count(*) as count from dialogue_item`
  }));
  // type bigint need to be converted to number
  res.total_dialogue_items = parseInt(rows[0].count);

  return res;
}
