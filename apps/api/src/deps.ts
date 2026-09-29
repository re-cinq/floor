// Everything a route handler needs: the stores, and the config values auth and token-minting read.
import {
  AssemblyRunStore,
  BlobsStore,
  CostsStore,
  DefinitionsStore,
  DispatchBriefs,
  EventStore,
  OutsideEvents,
  PgRunNotifier,
  RecordsStore,
  RunJournal,
  SchedulesStore,
  type PgPool,
  type RunNotifier,
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
  journal: RunJournal;
  /** Holds a connection of its own once somebody watches a run: close it when the floor stops. */
  notifier: RunNotifier;
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
    journal: new RunJournal({ pool }),
    notifier: new PgRunNotifier({ connectionString: config.databaseUrl, onError: (error) => console.error("floor live channel: lost its listening connection", error) }),
  };
}
