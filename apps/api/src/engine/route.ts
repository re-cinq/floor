// Pure: what one claimed event asks the floor to do, read from its name and payload alone.
import { z } from "zod";
import type { FloorEvent, Report, RunRef } from "@floor/store";
import { issuesOf } from "../parse.js";

export type Route =
  | { kind: "report"; visitId: string; report: Report; worker?: string }
  | { kind: "run-event"; run: RunRef; iteration?: number; requestedBy?: string }
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

const runRef = z.union([
  z.object({ runId: z.uuid() }),
  z.object({ subjectKey: z.string().min(1), repo: z.string().min(1).optional() }),
]);

const runEventPayload = z.object({
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
  const run = runRef.safeParse(payload);
  const parsed = runEventPayload.safeParse(payload);

  if (!run.success) return { kind: "invalid", reason: `run event: ${reasonOf(run.error)}` };
  if (!parsed.success) return { kind: "invalid", reason: `run event: ${reasonOf(parsed.error)}` };

  return { kind: "run-event", run: refOf(run.data), ...parsed.data };
}

// zod keeps only the keys a schema names, so the ref carries nothing else of the payload; a subject naming no repo is one of the runs that have none.
function refOf(parsed: z.infer<typeof runRef>): RunRef {
  if ("runId" in parsed) return parsed;

  return { subjectKey: parsed.subjectKey, repo: parsed.repo ?? null };
}

function namesRun(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && ("runId" in payload || "subjectKey" in payload);
}

function reasonOf(error: z.ZodError): string {
  return issuesOf(error).join("; ");
}
