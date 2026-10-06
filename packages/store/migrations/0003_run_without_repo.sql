-- A run may belong to no repository: a tick that fans out, an org-wide job. Such a run
-- stores a null repo, never an empty string. No repo counts as a repo of its own, so two
-- repo-less starts on one subject still join.

alter table assembly_runs alter column repo drop not null;

drop index if exists assembly_runs_subject_open;
create unique index assembly_runs_subject_open on assembly_runs (repo, subject_key) nulls not distinct
  where subject_key is not null and finished_at is null;
