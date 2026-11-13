-- What each cluster runs, as its cluster-agent reports on every register: the agent's own build and the agent subsystem's release and CLI pins. Null for an agent that does not send them, or a subsystem it could not read.
alter table clusters add column if not exists build text;
alter table clusters add column if not exists subsystem jsonb;
