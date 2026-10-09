// The agent station's contract with its own output, ported from lore's node-outcome.ts: `LORE_NODE_RESULT:` first, then `REVIEW_RESULT:`, then success; a marker present but unusable fails. Outcomes are the station's own, not a closed set.

export interface AgentVerdict {
  outcome: string;
  /** Whether the agent printed a `LORE_NODE_RESULT:` line at all: an outcome it chose, not one read into its silence. */
  spoken: boolean;
  /** What the agent said it produced, by name; the caller keeps only what the station declares. */
  produced: Record<string, string>;
  error?: string;
}

const MARKER = /^LORE_NODE_RESULT:[ \t]*(.*)$/gm;
const MAX_ERROR_CHARS = 300;

export function readAgentVerdict(output: string | undefined, outcomes: readonly string[]): AgentVerdict {
  const payload = lastMarkerPayload(output ?? "");

  if (payload === null) return { outcome: reviewVerdict(output ?? ""), produced: {}, spoken: false };

  return verdictFromPayload(payload, [...outcomes, "failed"]) ?? malformed(payload);
}

// Line-start and last-wins together make the marker safe to discuss: quoting it mid-sentence decides nothing, and printing it after explaining it is read by its final word.
function lastMarkerPayload(output: string): string | null {
  const last = [...output.matchAll(MARKER)].at(-1);

  return last ? last[1].trim() : null;
}

function reviewVerdict(output: string): string {
  return /REVIEW_RESULT:\s*CHANGES_REQUESTED/i.test(output) ? "changes_requested" : "success";
}

function verdictFromPayload(payload: string, allowed: readonly string[]): AgentVerdict | null {
  if (allowed.includes(payload)) return { outcome: payload, produced: {}, spoken: true };
  const parsed = parseObject(payload);

  if (typeof parsed?.outcome !== "string" || !allowed.includes(parsed.outcome)) return null;

  return { outcome: parsed.outcome, produced: stringsOf(parsed.produced ?? parsed.extras), spoken: true };
}

function parseObject(payload: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(payload);

    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stringsOf(candidate: unknown): Record<string, string> {
  if (typeof candidate !== "object" || candidate === null) return {};
  const strings = Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === "string");

  return Object.fromEntries(strings);
}

// Spoken but misheard: falling through to success would turn an agent's objection into a pass.
function malformed(payload: string): AgentVerdict {
  const error = `unparseable LORE_NODE_RESULT line: LORE_NODE_RESULT: ${payload}`.slice(0, MAX_ERROR_CHARS);

  return { outcome: "failed", produced: {}, error, spoken: true };
}
