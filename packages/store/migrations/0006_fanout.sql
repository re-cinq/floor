-- A fan-out runs its body node once per item of a list: each run is a branch of the same node and iteration, so a visit is told apart by (node, iteration, branch). An ordinary visit has no branch.
alter table station_runs add column if not exists branch int;

alter table station_runs drop constraint if exists station_runs_assembly_run_id_node_id_iteration_key;
create unique index if not exists station_runs_visit_key on station_runs (assembly_run_id, node_id, iteration, (coalesce(branch, -1)));
