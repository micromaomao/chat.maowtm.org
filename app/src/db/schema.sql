create extension if not exists ulid;

-- Used to track database version, to aid automatic migrations in the future.
create table db_migration_state (
  db_compat_version integer not null -- incremented every time an incompatible change is made to the schema
);
insert into db_migration_state (db_compat_version) values (1);

-- Global configuration like prompt to use, etc.
create table global_configuration (
  id ulid not null default gen_ulid() primary key,
  config json not null,
  app_version text not null
);
