-- The run journal (docs/assembly_run_storage.md, "The run journal"): everything that happens in
-- a run, in one order. A record's own seq is per visit and per kind, so a run had no single
-- cursor; this is it. Written by triggers and not by the code that writes, which is at least
-- seven places: a trigger cannot be forgotten by the eighth.

create table if not exists run_feed (
  run_id      uuid   not null references assembly_runs(id) on delete cascade,
  seq         bigint not null,                      -- the cursor: 1, 2, 3 with no gap, per run
  kind        text   not null,                      -- record | visit_opened | visit_reported | run_settled
  visit_id    uuid,
  record_kind text,
  record_seq  int,
  at          timestamptz not null default now(),
  primary key (run_id, seq)
);

-- Numbers the entry, and tells whoever listens that the run has something new. The lock is the
-- transaction's and the run's own, so two visits of one run number one after the other and leave
-- no gap; its two-integer key is a space apart from the lease's and the visit's. The notice names
-- the run and carries no body: a notice holds 8000 bytes, and whoever hears it reads the journal.
create or replace function floor_run_feed_append(entered_run uuid, entered_kind text, entered_visit uuid, entered_record_kind text, entered_record_seq int)
returns void language plpgsql as $$
begin
  perform pg_advisory_xact_lock(7233, hashtext(entered_run::text));

  insert into run_feed (run_id, seq, kind, visit_id, record_kind, record_seq)
  select entered_run, coalesce(max(seq), 0) + 1, entered_kind, entered_visit, entered_record_kind, entered_record_seq
  from run_feed where run_id = entered_run;

  perform pg_notify('floor_run_feed', json_build_object('schema', current_schema(), 'run', entered_run)::text);
end;
$$;

-- A record of a visit nobody opened belongs to no run, and is left out.
create or replace function floor_run_feed_record() returns trigger language plpgsql as $$
declare
  of_run uuid;
begin
  select assembly_run_id into of_run from station_runs where station_run_id = new.station_run_id;

  if of_run is not null then
    perform floor_run_feed_append(of_run, 'record', new.station_run_id, new.kind, new.seq);
  end if;

  return null;
end;
$$;

create or replace function floor_run_feed_visit_opened() returns trigger language plpgsql as $$
begin
  perform floor_run_feed_append(new.assembly_run_id, 'visit_opened', new.station_run_id, null, null);

  return null;
end;
$$;

create or replace function floor_run_feed_visit_reported() returns trigger language plpgsql as $$
begin
  perform floor_run_feed_append(new.assembly_run_id, 'visit_reported', new.station_run_id, null, null);

  return null;
end;
$$;

create or replace function floor_run_feed_run_settled() returns trigger language plpgsql as $$
begin
  perform floor_run_feed_append(new.id, 'run_settled', null, null, null);

  return null;
end;
$$;

-- `session` is where a conversation was saved: the sink's own note, and no part of what a run did.
drop trigger if exists run_feed_record on station_run_records;
create trigger run_feed_record after insert on station_run_records
  for each row when (new.kind <> 'session') execute function floor_run_feed_record();

drop trigger if exists run_feed_visit_opened on station_runs;
create trigger run_feed_visit_opened after insert on station_runs
  for each row execute function floor_run_feed_visit_opened();

drop trigger if exists run_feed_visit_reported on station_runs;
create trigger run_feed_visit_reported after update on station_runs
  for each row when (old.report is null and new.report is not null) execute function floor_run_feed_visit_reported();

drop trigger if exists run_feed_run_settled on assembly_runs;
create trigger run_feed_run_settled after update on assembly_runs
  for each row when (old.finished_at is null and new.finished_at is not null) execute function floor_run_feed_run_settled();
