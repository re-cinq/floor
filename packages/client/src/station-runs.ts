// Visits: what a service reads about them, and the brief an executor runs from.
import type { RecordKind, StationRunRecordView, VisitBrief, VisitView } from "@re-cinq/floor-contracts";
import { FloorProblem, problemOf } from "./problem.js";
import { asked, send, type Reachable } from "./send.js";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** A brief is asked for once a dispatch is claimed, and the answer decides what the worker does next. */
export type BriefOutcome =
  | { kind: "brief"; brief: VisitBrief }
  /** The visit already reported: ack the dispatch and run nothing. */
  | { kind: "reported" }
  /** No such visit: dead-letter the dispatch, since trying again will never find it. */
  | { kind: "absent" };

export interface RecordsPage {
  items: StationRunRecordView[];
  /** Null once the records have been read to their end. */
  nextCursor: number | null;
}

export interface StationRunsApi {
  list(query: { run: string; node?: string; open?: boolean }): Promise<VisitView[]>;
  get(visitId: string): Promise<(VisitView & { cost: unknown }) | null>;
  brief(visitId: string): Promise<BriefOutcome>;
  records(visitId: string, query: { kind: RecordKind; since?: number; limit?: number }): Promise<RecordsPage>;
}

export function stationRunsApi(floor: Reachable): StationRunsApi {
  return {
    list: async (query) => {
      const page = await asked<{ items: VisitView[] }>(floor, { method: "GET", path: "/station-runs", query });

      return page?.items ?? [];
    },
    get: (visitId) => asked<VisitView & { cost: unknown }>(floor, { method: "GET", path: `/station-runs/${visitId}` }, [HTTP_NOT_FOUND]),
    brief: (visitId) => briefOutcome(floor, visitId),
    records: async (visitId, query) => (await asked<RecordsPage>(floor, { method: "GET", path: `/station-runs/${visitId}/records`, query }))!,
  };
}

// Which of the three it is, is the status: `asked` would collapse both refusals to null, and the two mean opposite things to a claim loop.
export async function briefOutcome(floor: Reachable, visitId: string): Promise<BriefOutcome> {
  const asking = { method: "GET", path: `/station-runs/${visitId}/brief` } as const;
  const response = await send(floor, asking);

  if (response.status === HTTP_CONFLICT) return { kind: "reported" };
  if (response.status === HTTP_NOT_FOUND) return { kind: "absent" };
  if (!response.ok) throw new FloorProblem(await problemOf(response), asking);

  return { kind: "brief", brief: (await response.json()) as VisitBrief };
}
