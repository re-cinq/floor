-- The clusters a floor drives, each one known by the id its cluster-agent registers under, and what each holds of every agent definition, as the cluster-agent read it back out of its own kube.
create table if not exists clusters (
  id            text primary key,
  tags          text[] not null default '{}',
  registered_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists cluster_agent_definitions (
  cluster_id    text not null references clusters (id) on delete cascade,
  definition_id text not null,
  hash          text not null,
  body          jsonb not null,
  applied_at    timestamptz not null default now(),
  primary key (cluster_id, definition_id)
);
