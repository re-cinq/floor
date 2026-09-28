// Everything a route handler needs: the stores, and the config values auth and token-minting read.
import {
  AssemblyRunStore,
  BlobsStore,
  DefinitionsStore,
  EventStore,
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
}

export function buildDeps(pool: PgPool, config: Config, now: () => Date = () => new Date()): Deps {
  return {
    pool,
    config,
    now,
    runs: new AssemblyRunStore({ pool, now }),
    definitions: new DefinitionsStore({ connection: pool }),
    events: new EventStore({ connection: pool, now }),
    blobs: new BlobsStore({ connection: pool }),
  };
}
