-- The model catalog each cluster's agent reports on register; null for an agent that does not send one.
alter table clusters add column if not exists models jsonb;
