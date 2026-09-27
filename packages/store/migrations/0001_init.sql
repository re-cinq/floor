-- The six tables (docs/assembly_run_storage.md, "Tables"). Nothing here is
-- stored twice: `station_runs.outcome`/`session_ref` are generated columns
-- read out of the report's own JSON.

create table if not exists definitions (
  kind        text not null,                       -- line | station | agent_definition | schedule
  id          text not null,
  hash        text not null,                        -- sha256 of body
  body        jsonb not null,
  archived_at timestamptz,
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (kind, id, hash)
);
create index if not exists definitions_latest on definitions (kind, id, created_at desc);

create table if not exists assembly_runs (
  id           uuid primary key default gen_random_uuid(),
  line_id      text not null,
  line_hash    text not null,
  repo         text not null,
  subject_key  text,
  start_items  jsonb not null,
  outcome      text,
  reason       text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create unique index if not exists assembly_runs_subject_open on assembly_runs (repo, subject_key)
  where subject_key is not null and finished_at is null;
create index if not exists assembly_runs_list on assembly_runs (created_at desc, id desc);

create table if not exists station_runs (
  id                    bigserial primary key,      -- the replay's order
  station_run_id        uuid not null unique default gen_random_uuid(),
  assembly_run_id       uuid not null references assembly_runs(id),
  node_id               text not null,
  iteration             int  not null,
  station_hash          text,                       -- null for a marker
  agent_definition_hash text,
  input                 jsonb not null,             -- the Brief
  report                jsonb,                       -- the Report; null while open
  worker                text,
  requested_by          text,
  deadline              timestamptz,                 -- null for human kind
  opened_at             timestamptz not null default now(),
  finished_at           timestamptz,
  outcome               text generated always as (report->>'outcome') stored,
  session_ref           text generated always as (report->>'sessionRef') stored,
  unique (assembly_run_id, node_id, iteration)
);
create index if not exists station_runs_open on station_runs (deadline) where report is null;
create index if not exists station_runs_by_run on station_runs (assembly_run_id, id);

create table if not exists events (
  id              bigserial primary key,             -- the cursor
  name            text not null,                     -- node.<id>.start | station_run.dispatch | station_run.reported | schedule.<name>.tick | github.* | manual.*
  payload         jsonb not null,
  dedupe_key      text unique,                        -- a repeated post is the same event
  tags            text[] not null default '{}',       -- dispatch/abort: a claimer must offer all of these
  run_id          uuid,
  not_before      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  claimed_by      text,
  acked_at        timestamptz,
  attempts        int not null default 0,
  last_error      text,
  dead_at         timestamptz,
  dropped_at      timestamptz                         -- by cancel
);
create index if not exists events_claimable on events (not_before, id)
  where acked_at is null and dead_at is null and dropped_at is null;
create index if not exists events_by_run on events (run_id, id);

create table if not exists blobs (
  hash         text primary key,
  bytes        bytea not null,
  size         bigint not null,
  content_type text,
  created_at   timestamptz not null default now()
);

create table if not exists station_run_records (
  station_run_id uuid not null,
  kind           text not null,                       -- log | turn | llm_call
  seq            int  not null,
  body           jsonb not null,
  at             timestamptz not null,
  primary key (station_run_id, kind, seq)
);
