// Pure: what one claimed event asks the floor to do, read from its name and payload alone.
import { z } from "zod";
import type { FloorEvent, Report } from "@floor/store";
import { issuesOf } from "../parse.js";

export type Route =
  | { kind: "report"; visitId: string; report: Report; worker?: string }
  | { kind: "run-event"; runId: string; iteration?: number; requestedBy?: string }
  | { kind: "outside" }
  | { kind: "invalid"; reason: string };

const reportedPayload = z.object({
  visitId: z.uuid(),
  worker: z.string().optional(),
  report: z.object({
    outcome: z.string().min(1),
    produced: z.record(z.string(), z.string()).optional(),
    sessionRef: z.string().optional(),
    error: z.string().optional(),
  }),
});

const runEventPayload = z.object({
  runId: z.uuid(),
  iteration: z.number().int().positive().optional(),
  requestedBy: z.string().min(1).optional(),
});

export function routeEvent(event: Pick<FloorEvent, "name" | "payload">): Route {
  if (event.name === "station_run.reported") return routeReported(event.payload);
  if (event.name.startsWith("internal.")) return { kind: "outside" };

  return routeRunEvent(event.payload);
}

function routeReported(payload: unknown): Route {
  const parsed = reportedPayload.safeParse(payload);

  if (!parsed.success) return { kind: "invalid", reason: `station_run.reported: ${reasonOf(parsed.error)}` };

  return { kind: "report", ...parsed.data };
}

// An event that names no run starts no node; one that names a run badly is refused, not guessed at.
function routeRunEvent(payload: unknown): Route {
  if (!namesRun(payload)) return { kind: "outside" };
  const parsed = runEventPayload.safeParse(payload);

  if (!parsed.success) return { kind: "invalid", reason: `run event: ${reasonOf(parsed.error)}` };

  return { kind: "run-event", ...parsed.data };
}

function namesRun(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && "runId" in payload;
}

function reasonOf(error: z.ZodError): string {
  return issuesOf(error).join("; ");
}
