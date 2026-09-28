// Everything a route handler needs: the stores, and the config values auth and token-minting read.
import {
  AssemblyRunStore,
  BlobsStore,
  CostsStore,
  DefinitionsStore,
  DispatchBriefs,
  EventStore,
  OutsideEvents,
  RecordsStore,
  SchedulesStore,
  type PgPool,
} from "@floor/store";
import type { Config } from "./config.js";

export interface Deps {
  pool: PgPool;
  config: Config;
  now: () => Date;
  runs: AssemblyRunStore;
  definitions: DefinitionsStore;
  events: EventStore;
  blobs: BlobsStore;
  records: RecordsStore;
  briefs: DispatchBriefs;
  outside: OutsideEvents;
  costs: CostsStore;
  schedules: SchedulesStore;
}

export function buildDeps(pool: PgPool, config: Config, now: () => Date = () => new Date()): Deps {
  const runs = new AssemblyRunStore({ pool, now });
  const definitions = new DefinitionsStore({ connection: pool });
  const events = new EventStore({ connection: pool, now });

  return {
    pool,
    config,
    now,
    runs,
    definitions,
    outside: new OutsideEvents({ pool, runs, definitions }),
    events,
    blobs: new BlobsStore({ connection: pool }),
    records: new RecordsStore({ pool }),
    briefs: new DispatchBriefs({ pool, runs, definitions }),
    costs: new CostsStore({ connection: pool }),
    schedules: new SchedulesStore({ definitions, events, now }),
  };
}
