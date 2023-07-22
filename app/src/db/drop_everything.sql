drop table if exists db_migration_state cascade;
drop table if exists global_configuration cascade;
drop table if exists captcha_challenge cascade;
drop table if exists chat_session cascade;
drop table if exists chat_message cascade;
drop table if exists chat_message_embedding cascade;
drop table if exists stored_dialogue cascade;
drop table if exists dialogue_item cascade;
drop table if exists dialogue_phrasing cascade;
drop table if exists dialogue_phrasing_embedding cascade;
drop table if exists chat_reply_edit_log cascade;
drop table if exists chat_reply_metadata cascade;
drop table if exists chat_suggestion cascade;

drop extension if exists ulid;
