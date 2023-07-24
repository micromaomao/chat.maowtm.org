import { MsgType } from "db/enums";
import { NewChatMessageEvent, fetchLastChatMessages } from "./chat"
import { Client as DBClient, withDBClient } from "db/index";
import { input2log } from "./utils";
import getConfigStore from "db/config";
import { countTokens, getEmbedding } from "./ai/openai";

let session_id_to_generation_tasks: Map<string, GenerationTask> = new Map();

/**
 * The delay before starting the generation task.
 *
 * This delay exists for 2 reason - to give an illusion of "thinking", and also
 * to ensure that whatever new database client we get later will have seen the
 * updated message.
 */
const GENERATION_START_DELAY = 500;

const GENERATION_RETRY_INITIAL_DELAY = 500;
const GENERATION_MAX_RETRY_COUNT = 2;

class GenerationTask {
  private abort_controller: AbortController;
  private retry_count: number = 0;
  private next_retry_delay: number = GENERATION_RETRY_INITIAL_DELAY;

  last_message_id: string;
  message_evt: NewChatMessageEvent;
  session_id: string;

  constructor(msg_evt: NewChatMessageEvent) {
    this.last_message_id = msg_evt.id;
    this.message_evt = msg_evt;
    this.session_id = msg_evt.session_id;

    this.abort_controller = new AbortController();
    if (session_id_to_generation_tasks.has(this.session_id)) {
      throw new Error("Generation task already exists for this session.");
    }
    session_id_to_generation_tasks.set(this.session_id, this);

    setTimeout(() => {
      this.run();
    }, GENERATION_START_DELAY);
  }

  cancel() {
    this.abort_controller.abort();
    this.removeSelfFromMap();
  }

  get cancelled(): boolean {
    return this.abort_controller.signal.aborted;
  }

  private removeSelfFromMap() {
    let stored = session_id_to_generation_tasks.get(this.session_id);
    if (stored === this) {
      session_id_to_generation_tasks.delete(this.session_id);
    }
  }

  private async run() {
    if (this.cancelled) {
      return;
    }

    try {
      let res = await this.attempt();
      if (this.cancelled) {
        return;
      }
      await this.done(null, res);
    } catch (e) {
      if (this.cancelled) {
        return;
      }
      console.error(`(Attempt ${this.retry_count + 1} / ${GENERATION_MAX_RETRY_COUNT + 1}) \
Error generating reply for ${this.last_message_id} (${input2log(this.message_evt?.content)}) \
in ${this.session_id}:`, e);
      if (this.retry_count >= GENERATION_MAX_RETRY_COUNT) {
        await this.done(e, null);
      } else {
        this.retry_count += 1;
        setTimeout(() => {
          this.run();
        }, this.next_retry_delay);
        this.next_retry_delay *= 2;
      }
    }
  }

  private async attempt(): Promise<NewChatMessageEvent> {
    let config = (await getConfigStore()).config;
    let { generation_model, embedding_model } = config;
    const cancelledError = new Error("Cancelled");

    let message_hist = await withDBClient<any[]>(async db => {
      if (this.cancelled) {
        throw cancelledError;
      }
      let { rows }: { rows: any[] } = await db.query({
        name: "gen_responses.ts#GenerationTask#attempt#fetch_last_messages",
        text: `
          select
            msg.id as id,
            msg.msg_type as msg_type,
            msg.content as content,
            msg.generation_model as generation_model,
            msg.nb_tokens as nb_tokens,
            emb.embedding as embedding
          from chat_message msg
          left outer join chat_message_embedding emb
            on msg.id = emb.msg and emb.model = $1
          where msg.session = $2 and msg.old_regenerated = false
          order by id desc
          limit $3;`,
        values: [embedding_model, this.session_id, config.generation_history_limit],
      });
      if (this.cancelled) {
        throw cancelledError;
      }
      if (rows.length == 0 || rows[0].id != this.last_message_id) {
        this.cancel();
        throw cancelledError;
      }
      let curr_total_tokens = config.prompt_template_token_count;
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        if (this.cancelled) {
          throw cancelledError;
        }
        await ensureMsgRowHasTokenCount(row, generation_model, db, this.abort_controller.signal);
        if (this.cancelled) {
          throw cancelledError;
        }
        let curr_token_comsumption = row.nb_tokens + 1;
        if (curr_total_tokens + curr_token_comsumption > config.generation_token_limit) {
          // Delete this and all subsequent rows
          rows = rows.splice(i, rows.length - i);
          break;
        }
        curr_total_tokens += curr_token_comsumption;
        await ensureMsgRowHasEmbedding(row, embedding_model, db, this.abort_controller.signal);
        if (this.cancelled) {
          throw cancelledError;
        }
      }
      return rows;
    });
    if (this.cancelled) {
      return;
    }

    throw new Error("TODO");
  }

  private async done(error: Error | null, new_msg: NewChatMessageEvent | null) {
    this.removeSelfFromMap();
    if (this.cancelled) {
      return;
    }
    if (!error) {
      console.log(`Generated reply for ${this.last_message_id} in ${this.session_id}:\n\
> ${input2log(this.message_evt?.content)}\
< ${input2log(new_msg?.content)}`);
    }
    // TODO
  }
}

export async function ensureMsgRowHasTokenCount(msg_row: any, generation_model: string, db: DBClient, abort: AbortSignal) {
  if (msg_row.generation_model == generation_model && msg_row.nb_tokens !== null) {
    return;
  }
  let tokens = await countTokens(generation_model, msg_row.content);
  msg_row.generation_model = generation_model;
  msg_row.nb_tokens = tokens;
  if (abort.aborted) {
    return;
  }
  await db.query({
    text: "update chat_message set generation_model = $1, nb_tokens = $2 where id = $3",
    values: [generation_model, tokens, msg_row.id]
  });
}

export async function ensureMsgRowHasEmbedding(msg_row: any, embedding_model: string, db: DBClient, abort: AbortSignal) {
  if (msg_row.embedding !== null) {
    return;
  }
  let emb_res = await getEmbedding({ model: embedding_model }, msg_row.content, abort);
  msg_row.embedding = emb_res.result;
  if (abort.aborted) {
    return;
  }
  try {
    // We stringify emb_res.result because is an array, and node-postgres
    // translates it into a postgres array string which results in invalid
    // syntax.
    await db.query({
      text: "insert into chat_message_embedding (msg, model, embedding, nb_tokens) values ($1, $2, $3::jsonb, $4)",
      values: [msg_row.id, embedding_model, JSON.stringify(emb_res.result), emb_res.token_count]
    });
  } catch (e) {
    console.warn("Failed to insert embedding:", e);
    // Do nothing
  }
}

export async function startBackgroundGenerateResponseTask(message: NewChatMessageEvent): Promise<void> {
  if (message.msg_type != MsgType.User || message.reply_metadata || message.supress_generation) {
    throw new Error("Invalid message generation request");
  }
  let existing_gen_task = session_id_to_generation_tasks.get(message.session_id);
  let should_start = false;
  if (!existing_gen_task) {
    should_start = true;
  } else {
    if (existing_gen_task.last_message_id < message.id) {
      console.log(`Cancelling existing generation task for ${message.session_id}`);
      existing_gen_task.cancel();
      should_start = true;
    }
  }

  if (should_start) {
    new GenerationTask(message);
  }
}
