update db_migration_state set db_compat_version = 4 where db_compat_version = 3;

alter table chat_reply_metadata alter column matched_dialogue_items type ulid[] using matched_dialogue_items::ulid[];
alter table chat_reply_metadata alter column model_chat_inputs type ulid[] using model_chat_inputs::ulid[];
alter table chat_reply_metadata add column best_phrasing ulid[] not null default '{}';

alter table chat_reply_metadata rename column matched_phrasings to __deleted_matched_phrasings;
alter table chat_reply_metadata rename column match_scores to __deleted_match_scores;
alter table chat_reply_metadata rename column best_match_dialogue to __deleted_best_match_dialogue;
