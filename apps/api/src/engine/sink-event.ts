// Pure: what one event from the ai-agent-subsystem's supervisor means to a visit. The wire shapes are the subsystem's (website/.../reference/notification-api.md): an envelope around a line of the agent's own stream, Claude's or Gemini's, a lifecycle event, or a file event.
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
  /** The same counts, model by model. An agent calls more than the model it was given: a cheaper one to classify, or to compress what it has read. Each is priced at its own rate. */
  models?: Record<string, ModelCounts>;
}

/** Under the names `usage` goes by, whichever agent counted. */
export type ModelCounts = Record<string, number>;

const TIMEOUT_EXIT_CODE = 124;
const PRODUCED_PREFIX = "produced.";

/** Gemini counts what it read as `input` and `cached`, which together are its `input_tokens`. */
const geminiCounts = z.object({
  input: z.number().optional(),
  cached: z.number().optional(),
  output_tokens: z.number().optional(),
});

const geminiStats = geminiCounts.extend({
  duration_ms: z.number().optional(),
  models: z.record(z.string(), geminiCounts).optional(),
});

const claudeCounts = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional(),
  costUSD: z.number().optional(),
});

// Claude ends with what it said and what it cost. Gemini ends with a status and its counts, and says what it said in messages along the way.
const resultLine = z.object({
  type: z.literal("result"),
  result: z.string().optional(),
  is_error: z.boolean().optional(),
  total_cost_usd: z.number().optional(),
  num_turns: z.number().optional(),
  duration_ms: z.number().optional(),
  usage: z.unknown().optional(),
  modelUsage: z.record(z.string(), claudeCounts).optional(),
  status: z.string().optional(),
  error: z.object({ message: z.string() }).optional(),
  stats: geminiStats.optional(),
});

const spokenPiece = z.object({ type: z.literal("message"), role: z.literal("assistant"), content: z.string() });

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
  const counted = countedBy(line.stats);
  const cost = { costUsd: line.total_cost_usd, turns: line.num_turns, durationMs: line.duration_ms ?? counted.durationMs, usage: line.usage ?? counted.usage };

  return { kind: "result", text: saidAtTheEnd(line), failed: line.is_error ?? line.status === "error", cost: { ...cost, models: modelsOf(line) } };
}

function modelsOf(line: z.infer<typeof resultLine>): ResultCost["models"] {
  const claude = Object.entries(line.modelUsage ?? {}).map(([model, counts]) => [model, claudeCounted(counts)]);
  const gemini = Object.entries(line.stats?.models ?? {}).map(([model, counts]) => [model, geminiCounted(counts)]);
  const counted = [...claude, ...gemini];

  return counted.length > 0 ? (Object.fromEntries(counted) as ResultCost["models"]) : undefined;
}

// Claude prices each model itself, and says so.
function claudeCounted(counts: z.infer<typeof claudeCounts>): ModelCounts {
  const { inputTokens = 0, outputTokens = 0, cacheReadInputTokens = 0, cacheCreationInputTokens = 0 } = counts;
  const tokens = { input_tokens: inputTokens, cache_read_input_tokens: cacheReadInputTokens, cache_creation_input_tokens: cacheCreationInputTokens, output_tokens: outputTokens };

  return counts.costUSD === undefined ? tokens : { ...tokens, cost_usd: counts.costUSD };
}

function geminiCounted(counts: z.infer<typeof geminiCounts>): ModelCounts {
  const { input = 0, cached = 0, output_tokens: written = 0 } = counts;

  return { input_tokens: input, cache_read_input_tokens: cached, output_tokens: written };
}

function saidAtTheEnd(line: z.infer<typeof resultLine>): string {
  const reason = line.error;

  return line.result ?? reason?.message ?? "";
}

// Gemini's counts under the names Claude's go by, which are the names costs are read by.
function countedBy(stats: z.infer<typeof geminiStats> | undefined): Pick<ResultCost, "durationMs" | "usage"> {
  if (!stats) return {};

  return { durationMs: stats.duration_ms, usage: geminiCounted(stats) };
}

/** What the agent said, put together from the pieces it said it in: for an agent whose last line does not repeat it. */
export function spokenIn(turns: unknown[]): string {
  const pieces = turns.map((turn) => spokenPiece.safeParse(turn)).filter((piece) => piece.success);

  return pieces.map((piece) => piece.data.content).join("");
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
