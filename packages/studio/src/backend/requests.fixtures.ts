import { collectionView } from "./collection-view.js";
import { WORKER_COLLECTION } from "./collection-view.fixtures.js";

export const WORKER_VIEW = collectionView(WORKER_COLLECTION, []);

/** A StudioContext over the worker collection with no runs and no test runs, whose every write does nothing. */
export const IDLE_CONTEXT = { readCollection: async () => WORKER_VIEW, writeAgent: async () => undefined, writeExtra: async () => undefined, readFixture: async () => ({}), writeFixture: async () => undefined, readRun: async () => undefined, writeRun: async () => undefined, runs: new Map(), collectionDir: "", testRuns: new Map(), broadcast: () => undefined, openFolder: () => undefined };
