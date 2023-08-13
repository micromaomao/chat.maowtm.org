create extension if not exists ulid;

-- Used to track database version, to aid automatic migrations in the future.
create table db_migration_state (
  -- Incremented every time an incompatible change is made to the schema
  db_compat_version integer not null
);
insert into db_migration_state (db_compat_version) values (2);

-- Global configuration like prompt to use, etc.
create table global_configuration (
  id text not null default gen_ulid() primary key,
  config json not null,
  app_version text not null
);

create table captcha_challenge (
  challenge_token bytea not null primary key,
  response_id text not null,
  source_ip inet not null,
  created_time timestamptz not null default now(),
  solve_time timestamptz default null,
  -- References chat_session
  associated_session text default null
);

create table chat_session (
  -- Not secret identifier for this chat session
  session_id text not null default gen_ulid() primary key,

  -- Secret used for fetching / sending messages
  session_token bytea not null unique,

  -- Required to refresh if too old, depending on server settings
  last_captcha bytea default null references captcha_challenge (challenge_token) on delete set null,

  -- References to dialogue_group. Cache for determining "ignore_for_first_match"
  last_matched_dialogues text[] not null default '{}'
);

alter table captcha_challenge add foreign key (associated_session) references chat_session (session_id) on delete set null;

create table chat_message (
  id text not null default gen_ulid() primary key,
  session text not null references chat_session (session_id) on delete cascade,

  -- enum: 0 = bot, 1 = user
  msg_type int not null,

  content text not null,

  -- True if this message will be hidden from the chat history referenced by
  -- generation code.  For example this will be true if this message has been
  -- replaced by an attempted "regenerate response", or if this message violates
  -- the terms of use.
  exclude_from_generation boolean not null default false,

  -- Name of LLM used to generate this (or, for a user message, a reply to this).
  -- This field mostly exist as a cache hint for nb_tokens.
  generation_model text default null,

  -- Number of tokens using the tokenization scheme of .generation_model
  nb_tokens int default null
);

create unique index chat_msg_session_and_id on chat_message (session, id);

-- Store embeddings for user messages only, for future analytics etc.
create table chat_message_embedding (
  msg text not null references chat_message (id) on delete cascade,

  -- Name of the embedding model
  model text not null,

  -- Array of floats
  embedding jsonb not null,

  -- Number of tokens using the tokenization scheme of .model
  nb_tokens int not null,

  primary key (msg, model)
);

-- Dialogue group - one group typically contains one root dialogue (perhaps with
-- different phrasings)
create table dialogue_group (
  id text not null default gen_ulid() primary key
);

create table dialogue_item (
  item_id text not null default gen_ulid() primary key,
  dialogue_group text not null references dialogue_group (id) on delete cascade,

  -- Represents a root if null
  parent text default null references dialogue_item (item_id) on delete set null,

  -- References dialogue_phrasing. Determine which phrasing is shown in the editing UI, does not affect generation.
  canonical_phrasing text default null,

  response text not null,

  -- If true, user input will not match against this unless previously matched
  -- this dialogue_group. Useful for items like "yes" or "tell me more".
  ignore_for_first_match boolean not null default false
);

-- User input is matched against all phrasings for an item, and the score for
-- the item is the max score across all phrasings.
create table dialogue_phrasing (
  id text not null default gen_ulid() primary key,
  dialogue_item text not null references dialogue_item (item_id) on delete cascade,
  q_text text not null,

  -- A matched "counterexample" phrasing will prevent this item from being
  -- matched unless another phrasing is matched first, with a higher score.
  is_counterexample boolean not null default false
);

alter table dialogue_item add foreign key (canonical_phrasing) references dialogue_phrasing (id) on delete set null;

create table dialogue_phrasing_embedding (
  phrasing text not null references dialogue_phrasing (id) on delete cascade,

  -- Name of the embedding model
  model text not null,

  -- Array of floats
  embedding jsonb not null,

  -- Number of tokens using the tokenization scheme of .model
  nb_tokens int not null,

  generation_time timestamptz not null default now(),

  primary key (phrasing, model)
);

create table chat_reply_edit_log (
  id text not null default gen_ulid() primary key,

  -- Search for this using chat_reply_metadata.last_edit
  reply_msg text not null references chat_message (id) on delete cascade,

  -- id of the dialogue item added or updated
  edited_dialogue_item text not null references dialogue_item (item_id) on delete cascade
);

-- Metadata for generated reply messages for future analytics.
create table chat_reply_metadata (
  reply_msg text not null references chat_message (id) on delete cascade primary key,

  -- References to dialogue_item
  matched_dialogue_items text[] not null,
  matched_item_scores float8[] not null,

  -- The above 3 fields can be empty / null if no good match

  -- References to chat_message
  model_chat_inputs text[] not null,

  -- True if we bypassed the LLM due to high confidence
  direct_result boolean not null default false,

  -- enum: -1 = dislike, 0 = default, 1 = like
  user_feedback int not null default 0,

  regen_of text default null references chat_message (id) on delete set null,
  last_edit text default null references chat_reply_edit_log (id) on delete set null
);

create table chat_suggestion (
  -- id of the bot reply message this suggestion applies to
  reply_msg text not null references chat_message (id) on delete cascade,
  suggestion text not null,

  -- enum: 0 = none, 1 = clicked
  user_action int not null default 0,

  primary key (reply_msg, suggestion)
);

create table admin_token (
  token bytea not null primary key,
  expiry timestamptz not null
);

-- A simple table to track rate limiting
create table rate_limit_state (
  key text not null primary key,
  last_reset timestamptz not null,
  count int not null
);
