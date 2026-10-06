-- The floor-wide feed: a listener of the whole floor learns of a run starting, which no run's
-- journal holds. The notice now names its kind, so a floor listener can tell a run started from
-- a record written; the journal and its cursor stay as they were, and a start writes no row to it.
create or replace function floor_run_feed_append(entered_run uuid, entered_kind text, entered_visit uuid, entered_record_kind text, entered_record_seq int)
returns void language plpgsql as $$
begin
  perform pg_advisory_xact_lock(7233, hashtext(entered_run::text));

  insert into run_feed (run_id, seq, kind, visit_id, record_kind, record_seq)
  select entered_run, coalesce(max(seq), 0) + 1, entered_kind, entered_visit, entered_record_kind, entered_record_seq
  from run_feed where run_id = entered_run;

  perform pg_notify('floor_run_feed', json_build_object('schema', current_schema(), 'run', entered_run, 'kind', entered_kind)::text);
end;
$$;

create or replace function floor_run_feed_run_started() returns trigger language plpgsql as $$
begin
  perform pg_notify('floor_run_feed', json_build_object('schema', current_schema(), 'run', new.id, 'kind', 'run_started')::text);

  return null;
end;
$$;

drop trigger if exists run_feed_run_started on assembly_runs;
create trigger run_feed_run_started after insert on assembly_runs
  for each row execute function floor_run_feed_run_started();
