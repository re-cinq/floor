-- A start by hand reopens a settled run (docs/decisions.md, "A start by hand reopens a finished
-- run"), so its journal goes on past its settling. The reopening is journalled as `run_reopened`,
-- the mirror of `run_settled`: a viewer replaying the run learns that the settling it has read
-- was not the last, and a floor listener hears the run changed.
create or replace function floor_run_feed_run_reopened() returns trigger language plpgsql as $$
begin
  perform floor_run_feed_append(new.id, 'run_reopened', null, null, null);

  return null;
end;
$$;

drop trigger if exists run_feed_run_reopened on assembly_runs;
create trigger run_feed_run_reopened after update on assembly_runs
  for each row when (old.finished_at is not null and new.finished_at is null) execute function floor_run_feed_run_reopened();
