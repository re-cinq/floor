// Pure: what one event from the ai-agent-subsystem's supervisor means to a visit. The wire shapes are the subsystem's (website/.../reference/notification-api.md): an envelope around a Claude stream-json line, a lifecycle event, or a file event.
import { z } from "zod";

export type SinkEvent =
  | { kind: "turn" }
  | { kind: "log" }
  | { kind: "result"; text: string; failed: boolean; cost: ResultCost }
  | { kind: "file"; name: string; ref: string | null }
  | { kind: "ended"; failed: boolean; error?: string };

export interface ResultCost {
  costUsd?: number;
  turns?: number;
  durationMs?: number;
  usage?: unknown;
}

const TIMEOUT_EXIT_CODE = 124;
const PRODUCED_PREFIX = "produced.";

const resultLine = z.object({
  type: z.literal("result"),
  result: z.string().optional(),
  is_error: z.boolean().optional(),
  total_cost_usd: z.number().optional(),
  num_turns: z.number().optional(),
  duration_ms: z.number().optional(),
  usage: z.unknown().optional(),
});

const fileEvent = z.object({
  kind: z.literal("file"),
  event: z.string().startsWith(PRODUCED_PREFIX),
  uploaded: z.boolean().optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

const lifecycleEvent = z.object({
  kind: z.literal("lifecycle"),
  phase: z.string(),
  status: z.string(),
  tool: z.string().optional(),
  reason: z.string().optional(),
  exitCode: z.number().optional(),
});

type Lifecycle = z.infer<typeof lifecycleEvent>;

/** The payload inside the subsystem's `{source, event}` envelope, or the body itself when it came bare. */
export function peel(body: unknown): unknown {
  return isRecord(body) && "source" in body && "event" in body ? body.event : body;
}

export function readSinkEvent(body: unknown): SinkEvent {
  const payload = peel(body);

  return readResult(payload) ?? readFile(payload) ?? readLifecycle(payload) ?? readLine(payload);
}

function readResult(payload: unknown): SinkEvent | null {
  const parsed = resultLine.safeParse(payload);

  if (!parsed.success) return null;
  const line = parsed.data;
  const cost = { costUsd: line.total_cost_usd, turns: line.num_turns, durationMs: line.duration_ms, usage: line.usage };

  return { kind: "result", text: line.result ?? "", failed: line.is_error ?? false, cost };
}

function readFile(payload: unknown): SinkEvent | null {
  const parsed = fileEvent.safeParse(payload);

  if (!parsed.success) return null;
  const file = parsed.data;
  const stored = file.uploaded && file.sha256 ? `sha256-${file.sha256}` : null;

  return { kind: "file", name: file.event.slice(PRODUCED_PREFIX.length), ref: stored };
}

function readLifecycle(payload: unknown): SinkEvent | null {
  const parsed = lifecycleEvent.safeParse(payload);

  if (!parsed.success) return null;
  if (!endsVisit(parsed.data)) return { kind: "log" };
  const failed = parsed.data.status === "failed";

  return failed ? { kind: "ended", failed, error: failureOf(parsed.data) } : { kind: "ended", failed };
}

// The agent phase ends either way; the init phase ends the visit only by failing, since the agent never starts.
function endsVisit(lifecycle: Lifecycle): boolean {
  if (lifecycle.status === "failed") return true;

  return lifecycle.phase === "agent" && lifecycle.status === "succeeded";
}

function failureOf(lifecycle: Lifecycle): string {
  if (lifecycle.exitCode === TIMEOUT_EXIT_CODE) return "timeout: the agent ran past its deadline";
  const details = [lifecycle.tool && `tool ${lifecycle.tool}`, lifecycle.reason, lifecycle.exitCode !== undefined && `exit code ${lifecycle.exitCode}`];

  return `${lifecycle.phase} failed: ${details.filter(Boolean).join(", ") || "no reason given"}`;
}

function readLine(payload: unknown): SinkEvent {
  return isRecord(payload) && typeof payload.type === "string" ? { kind: "turn" } : { kind: "log" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
