// Assembly runs: starting one, reading it, and watching it happen.
import type { CostsRow, Item, RunView } from "@re-cinq/floor-contracts";
import type { CostsFilter, CostsGroupBy, RunFilter } from "./filters.js";
import { asked, type Reachable } from "./send.js";
import { watchRun, type RunWatch, type WatchOptions } from "./live.js";

const HTTP_NOT_FOUND = 404;

export interface StartRun {
  repo: string;
  startItems: Record<string, Item>;
  /** Starts somewhere other than the line's entry; the node must exist. */
  entry?: string;
}

export interface StartedRun {
  run: RunView;
  /** True when a run was already open on this subject and this start joined it rather than opening a second. */
  joined: boolean;
}

export interface RunPage {
  items: RunView[];
  nextCursor: string | null;
}

export interface RunsApi {
  list(filter: RunFilter, page?: { limit?: number; cursor?: string }): Promise<RunPage>;
  get(runId: string): Promise<{ run: RunView; bag: Record<string, Item> } | null>;
  cancel(runId: string, reason: string): Promise<RunView>;
  /** Replays the run from `after`, then follows it live. Reconnects from the last seq it handed out. */
  watch(runId: string, options?: WatchOptions): RunWatch;
}

export function runsApi(floor: Reachable): RunsApi {
  return {
    list: async (filter, page) => (await asked<RunPage>(floor, { method: "GET", path: "/assembly-runs", query: { ...filter, ...page } }))!,
    get: (runId) => asked<{ run: RunView; bag: Record<string, Item> }>(floor, { method: "GET", path: `/assembly-runs/${runId}` }, [HTTP_NOT_FOUND]),
    cancel: async (runId, reason) => (await asked<RunView>(floor, { method: "POST", path: `/assembly-runs/${runId}/cancel`, body: { reason } }))!,
    watch: (runId, options) => watchRun(floor, runId, options),
  };
}

export interface CostsRowsApi {
  summary(filter: CostsFilter, group: CostsGroupBy): Promise<CostsRow[]>;
}

export function costsApi(floor: Reachable): CostsRowsApi {
  return {
    summary: async (filter, group) => {
      const page = await asked<{ items: CostsRow[] }>(floor, { method: "GET", path: "/costs", query: { ...filter, group } });

      return page?.items ?? [];
    },
  };
}
