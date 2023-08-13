update db_migration_state set db_compat_version = 2 where db_compat_version = 1;

create table rate_limit_state (
  key text not null primary key,
  last_reset timestamptz not null,
  count int not null
);
