// Everything a route handler needs: the stores, and the config values auth and token-minting read.
import {
  AssemblyRunStore,
  BlobsStore,
  DefinitionsStore,
  EventStore,
  OutsideEvents,
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
  outside: OutsideEvents;
}

export function buildDeps(pool: PgPool, config: Config, now: () => Date = () => new Date()): Deps {
  const runs = new AssemblyRunStore({ pool, now });
  const definitions = new DefinitionsStore({ connection: pool });

  return {
    pool,
    config,
    now,
    runs,
    definitions,
    outside: new OutsideEvents({ pool, runs, definitions }),
    events: new EventStore({ connection: pool, now }),
    blobs: new BlobsStore({ connection: pool }),
  };
}
