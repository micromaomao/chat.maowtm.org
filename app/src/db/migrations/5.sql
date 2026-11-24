alter table dialogue_phrasing_embedding add column source_text text;

create table client_tag (
  scope text not null,
  tag text not null,
  response jsonb not null,
  message text references chat_message (id) on delete cascade,
  primary key (scope, tag)
);
create index client_tag_message on client_tag (message);

create table chat_generation_job (
  session text primary key references chat_session (session_id) on delete cascade,
  source_message text not null references chat_message (id) on delete cascade,
  reply_message text references chat_message (id) on delete cascade,
  attempts int not null default 0
);

create table chat_session_event (
  id bigserial primary key,
  session text not null references chat_session (session_id) on delete cascade,
  payload jsonb not null,
  created_time timestamptz not null default now()
);
create index chat_session_event_session on chat_session_event (session, id);

create table dialogue_revision (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0
);
insert into dialogue_revision default values;

create function bump_dialogue_revision() returns trigger language plpgsql as $$
begin
  update dialogue_revision set revision = revision + 1;
  return null;
end;
$$;
create trigger dialogue_item_revision after insert or update or delete on dialogue_item
  for each statement execute function bump_dialogue_revision();
create trigger dialogue_phrasing_revision after insert or update or delete on dialogue_phrasing
  for each statement execute function bump_dialogue_revision();
create trigger dialogue_embedding_revision after insert or update or delete on dialogue_phrasing_embedding
  for each statement execute function bump_dialogue_revision();

update db_migration_state set db_compat_version = 5;
