import { MsgType } from "db/enums";
import { NewChatMessageEvent, addChatMessage, excludeSingleMessage } from "./chat"
import { Client as DBClient, withDBClient } from "db/index";
import { asyncSleep, input2log } from "./utils";
import getConfigStore from "db/config";
import { ChatHistoryInputLine, LLMBase, LLMChatCompletionInput } from "./llm/base";
import { MatchDialogueResult, DialogueMatcher, getCachedMatcher } from "./match_dialogue";
import { NewChatSuggestionEvent, extractSuggestions, fetchSuggestions, setMessageSuggestions } from "./chat_suggestions";

let session_id_to_generation_tasks: Map<string, GenerationTask> = new Map();

const PROMPT_SAMPLE_REPLACEMENT_TEXT = "<|DIALOGUE_ITEMS|>";
const PROMPT_SAMPLE_USER_PREFIX = "User: ";
const PROMPT_SAMPLE_BOT_PREFIX = "You: ";
const PROMPT_SAMPLE_NO_CONTENT = "(no relevant content found)";

const MODEL_PER_MESSAGE_TOKEN_OVERHEAD = 3;

/**
 * The delay before starting the generation task.
 *
 * This delay exists for 2 reason - to give an illusion of "thinking", and also
 * to ensure that whatever new database client we get later will have seen the
 * updated message.
 */
const GENERATION_START_DELAY = 500;

const GENERATION_RETRY_INITIAL_DELAY = 1000;
const GENERATION_MAX_RETRY_COUNT = 2;

const EXTRA_SUGGESTIONS_DELAY = 5000;

class UnrecoverableGenerationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class GenerationTask {
  private abort_controller: AbortController;
  private retry_count: number = 0;
  private next_retry_delay: number = GENERATION_RETRY_INITIAL_DELAY;

  private generated_message_evt: NewChatMessageEvent | null = null;
  private continue_completion_input: LLMChatCompletionInput | null = null;
  private generated_suggestion_evt: NewChatSuggestionEvent | null = null;

  last_message_id: string;
  src_message_evt: NewChatMessageEvent;
  session_id: string;
  dialogue_matcher: DialogueMatcher;

  constructor(msg_evt: NewChatMessageEvent, dialogue_matcher: DialogueMatcher) {
    this.last_message_id = msg_evt.id;
    this.src_message_evt = msg_evt;
    this.session_id = msg_evt.session_id;
    this.dialogue_matcher = dialogue_matcher;

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
      await this.attemptReplyGeneration();
      if (this.cancelled) {
        return;
      }
      if (!this.generated_suggestion_evt) {
        if (this.retry_count == 0) {
          await asyncSleep(EXTRA_SUGGESTIONS_DELAY);
          if (this.cancelled) {
            return;
          }
        }
        await this.attemptSuggestionGeneration();
        if (this.cancelled) {
          return;
        }
      }
      await this.done(null);
    } catch (e) {
      if (this.cancelled) {
        return;
      }
      console.error(`(Attempt ${this.retry_count + 1} / ${GENERATION_MAX_RETRY_COUNT + 1}) \
Error generating reply for ${this.last_message_id} (${input2log(this.src_message_evt?.content)}) \
in ${this.session_id}:`, e);
      if (e instanceof UnrecoverableGenerationError) {
        console.error("Above error is unrecoverable, not retrying.");
      }
      if (e instanceof UnrecoverableGenerationError || this.retry_count >= GENERATION_MAX_RETRY_COUNT) {
        await this.done(e);
      } else {
        this.retry_count += 1;
        setTimeout(() => {
          this.run();
        }, this.next_retry_delay);
        this.next_retry_delay *= 2;
      }
    }
  }

  private async attemptReplyGeneration(): Promise<void> {
    if (this.generated_message_evt || this.cancelled) {
      return;
    }

    const conf_store = await getConfigStore();
    let config = conf_store.config;
    let generation_model = conf_store.generation_model;
    let embedding_model = conf_store.embedding_model;
    const cancelledError = new Error("Cancelled");

    let curr_total_tokens = await generation_model.countTokens(
      config.prompt_template.replace(PROMPT_SAMPLE_REPLACEMENT_TEXT, ""),
      {},
      this.abort_controller.signal
    );
    let max_prompt_tokens = config.generation_model.total_token_limit - config.generation_model.reserve_token_count;
    let match_res: MatchDialogueResult;
    let sample_texts: string[];
    let msg_hist_full: any[];

    await withDBClient(async db => {
      if (this.cancelled) {
        throw cancelledError;
      }
      msg_hist_full = (await db.query({
        name: "gen_responses.ts#GenerationTask#attempt#fetch_last_messages",
        text: `
          select
            msg.id as id,
            session as session_id,
            msg.msg_type as msg_type,
            msg.content as content,
            msg.generation_model as generation_model,
            msg.nb_tokens as nb_tokens,
            emb.embedding as embedding
          from chat_message msg
          left outer join chat_message_embedding emb
            on msg.id = emb.msg and emb.model = $1
          where
            msg.session = $2 and
            msg.exclude_from_generation = false and
            (msg.msg_type = ${MsgType.User} or msg.msg_type = ${MsgType.Bot})
          order by id desc
          limit $3;`,
        values: [embedding_model.model_name, this.session_id, config.generation_model.history_limit],
      })).rows;
      if (this.cancelled) {
        throw cancelledError;
      }
      if (msg_hist_full.length == 0 || msg_hist_full[0].id > this.last_message_id) {
        this.cancel();
        throw cancelledError;
      }
      if (msg_hist_full[0].id < this.last_message_id) {
        // Will trigger a retry
        throw new Error("Unable to fetch latest message.");
      }

      for (let row of msg_hist_full) {
        if (this.cancelled) {
          throw cancelledError;
        }
        await ensureMsgRowHasTokenCount(row, generation_model, db, this.abort_controller.signal);
        if (this.cancelled) {
          throw cancelledError;
        }
        await ensureMsgRowHasEmbedding(row, embedding_model, db, this.abort_controller.signal);
      }
      if (this.cancelled) {
        throw cancelledError;
      }

      match_res = await this.dialogue_matcher.matchDialogue(
        msg_hist_full,
        config.generation_model.max_sample_tokens,
        this.abort_controller.signal,
        db
      );
      if (this.cancelled) {
        throw cancelledError;
      }

      sample_texts = match_res.model_sample_input.map(x => {
        if (typeof x == "string") {
          return x;
        } else {
          return generation_model.dialogueToPrompt(x);
        }
      });

      if (match_res.direct_result) {
        throw new UnrecoverableGenerationError("Unimplemented");
      } else {
        if (sample_texts.length == 0) {
          sample_texts.push(PROMPT_SAMPLE_NO_CONTENT);
        }
      }
    });

    if (this.cancelled) {
      throw cancelledError;
    }

    if (match_res.direct_result) {
      throw new UnrecoverableGenerationError("Unimplemented");
    } else {
      if (!config.prompt_template.includes(PROMPT_SAMPLE_REPLACEMENT_TEXT)) {
        throw new UnrecoverableGenerationError("Prompt template does not contain replacement text");
      }
      let sample_text_str = sample_texts.join("\n");
      let prompt = config.prompt_template.replace(PROMPT_SAMPLE_REPLACEMENT_TEXT, sample_text_str);
      curr_total_tokens += await generation_model.countTokens(sample_text_str, {}, this.abort_controller.signal);
      if (this.cancelled) {
        throw cancelledError;
      }

      let input: LLMChatCompletionInput = {
        chat_history: [],
        instruction_prompt: prompt,
      };

      let chat_input_ids = [];
      let attempted_include_suggestions = false;
      for (let row of msg_hist_full) {
        chat_input_ids.push(row.id);
        let input_line: ChatHistoryInputLine = {
          role: row.msg_type == MsgType.User ? "user" : "bot",
          text: row.content,
        };
        input.chat_history.push(input_line);
        let new_total_tokens = curr_total_tokens + row.nb_tokens + MODEL_PER_MESSAGE_TOKEN_OVERHEAD; // Some overhead for message separators
        if (new_total_tokens > max_prompt_tokens && input.chat_history.length > 1) {
          break;
        }
        curr_total_tokens = new_total_tokens;

        if (!attempted_include_suggestions && row.msg_type == MsgType.Bot) {
          attempted_include_suggestions = true;
          let suggestions = await fetchSuggestions(row.id);
          if (suggestions.length > 0) {
            let additional_text = "\n" + suggestions.map((x, i) => `Suggestion ${i + 1}: ${x}`).join("\n");
            input_line.text += additional_text;
            curr_total_tokens += await generation_model.countTokens(additional_text, { session_id: row.session_id }, this.abort_controller.signal);
          }
        }
      }

      if (input.chat_history[input.chat_history.length - 1].role == "bot" && input.chat_history.length >= 2) {
        curr_total_tokens -= msg_hist_full[input.chat_history.length - 1].nb_tokens + MODEL_PER_MESSAGE_TOKEN_OVERHEAD;;
        input.chat_history.pop();
        chat_input_ids.pop();
      }

      input.chat_history.reverse();
      chat_input_ids.reverse();

      let completion_res = await generation_model.chatCompletion(input, { session_id: this.session_id }, this.abort_controller.signal);
      if (this.cancelled) {
        throw cancelledError;
      }

      let suggestion_extraction_res = extractSuggestions(completion_res.text);

      await withDBClient(async db => {
        if (this.cancelled) {
          throw cancelledError;
        }

        this.generated_message_evt = await addChatMessage({
          session_id: this.session_id,
          msg_type: MsgType.Bot,
          content: suggestion_extraction_res.message_without_suggestions,
          generation_model: generation_model.model_name,
          nb_tokens: completion_res.completion_tokens,
          supress_generation: true,
          reply_metadata: {
            ...match_res,
            model_chat_inputs: chat_input_ids
          }
        }, db);

        if (this.cancelled) {
          throw cancelledError;
        }

        this.storeSuggestions(suggestion_extraction_res.suggestions, db);
      });

      if (this.cancelled) {
        throw cancelledError;
      }

      if (suggestion_extraction_res.suggestions.length == 0) {
        this.continue_completion_input = input;
        input.chat_history.push({
          role: "bot",
          text: completion_res.text,
        });
        let curr_total_tokens = completion_res.total_tokens;
        while (input.chat_history.length > 1 && curr_total_tokens > max_prompt_tokens) {
          let first_msg = input.chat_history.shift();
          curr_total_tokens -= await generation_model.countTokens(first_msg.text, { session_id: this.session_id }, this.abort_controller.signal);
          if (this.cancelled) {
            throw cancelledError;
          }
        }
      }
    }
  }

  private async storeSuggestions(generated_suggestions: string[], db?: DBClient): Promise<void> {
    if (generated_suggestions.length > 3) {
      generated_suggestions = generated_suggestions.slice(0, 3);
    }
    if (generated_suggestions.length == 0) {
      return;
    }
    this.generated_suggestion_evt = await setMessageSuggestions(this.generated_message_evt.id, generated_suggestions, db);
  }

  private async attemptSuggestionGeneration(): Promise<void> {
    if (this.generated_suggestion_evt || this.cancelled) {
      return;
    }
    if (!this.generated_message_evt) {
      throw new Error("Cannot generate suggestions without a generated message");
    }
    const cancelledError = new Error("Cancelled");

    const conf_store = await getConfigStore();

    if (this.continue_completion_input) {
      let completion_res = await conf_store.generation_model.chatCompletion(
        this.continue_completion_input,
        { session_id: this.session_id },
        this.abort_controller.signal
      );
      if (this.cancelled) {
        throw cancelledError;
      }

      let suggestion_extraction_res = extractSuggestions(completion_res.text);

      await withDBClient(async db => {
        if (this.cancelled) {
          throw cancelledError;
        }
        this.storeSuggestions(suggestion_extraction_res.suggestions, db);
      });
    }
  }

  private async done(error: Error | null) {
    this.removeSelfFromMap();
    if (this.cancelled) {
      return;
    }
    let new_msg = this.generated_message_evt;
    if (!error) {
      console.log(`Generated reply for ${this.last_message_id} in ${this.session_id}:\n\
> ${input2log(this.src_message_evt?.content)}\n\
< ${input2log(new_msg?.content)}`);
    } else if (!new_msg) {
      try {
        await withDBClient(async db => {
          await addChatMessage({
            msg_type: MsgType.Error,
            session_id: this.session_id,
            content: `Failed to generate reply for the previous message. Please try again later.\n${error}`,
          }, db);
          await excludeSingleMessage(this.last_message_id, db);
        });
      } catch (e) {
        console.error(`Failed to send error message back to user on chat session ${this.session_id}`, e)
      }
    }
  }
}

export async function ensureMsgRowHasTokenCount(msg_row: any, generation_model: LLMBase, db: DBClient, abort: AbortSignal) {
  if (msg_row.generation_model == generation_model.model_name && msg_row.nb_tokens !== null) {
    return;
  }
  let tokens = await generation_model.countTokens(msg_row.content, { session_id: msg_row.session_id }, abort);
  msg_row.generation_model = generation_model.model_name;
  msg_row.nb_tokens = tokens;
  if (abort.aborted) {
    return;
  }
  try {
    await db.query({
      text: "update chat_message set generation_model = $1, nb_tokens = $2 where id = $3",
      values: [generation_model.model_name, tokens, msg_row.id]
    });
  } catch (e) {
    console.warn(`Failed to update token count for message ${msg_row.id}`, e);
    // Do nothing
  }
}

export async function ensureMsgRowHasEmbedding(msg_row: any, embedding_model: LLMBase, db: DBClient, abort: AbortSignal) {
  if (msg_row.embedding !== null) {
    return;
  }
  let emb_res = await embedding_model.getEmbeddings(msg_row.content, { session_id: msg_row.session_id }, abort);
  msg_row.embedding = emb_res.embedding;
  if (abort.aborted) {
    return;
  }
  try {
    // We stringify emb_res.result because is an array, and node-postgres
    // translates it into a postgres array string which results in invalid
    // syntax.
    await db.query({
      text: "insert into chat_message_embedding (msg, model, embedding, nb_tokens) values ($1, $2, $3::jsonb, $4)",
      values: [msg_row.id, embedding_model.model_name, JSON.stringify(emb_res.embedding), emb_res.total_tokens]
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
    let matcher = await getCachedMatcher();
    new GenerationTask(message, matcher);
  }
}

export function cancelGenerationTask(session_id: string) {
  let existing_gen_task = session_id_to_generation_tasks.get(session_id);
  if (existing_gen_task) {
    console.log(`Cancelling existing generation task for ${session_id}`);
    existing_gen_task.cancel();
  }
}
