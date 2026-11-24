// A run's output, read for a person: what the agent said, each tool it called, what was refused, and the sum of the run. Claude's stream-json events are read; any other line is kept as it is.
import type { RunOutput } from "./use-run";

export interface TranscriptEntry {
  kind: "said" | "tool" | "error" | "result" | "raw";
  text: string;
}

type Fields = Record<string, unknown>;

const MS_PER_SECOND = 1000;
const COST_DIGITS = 4;
const SUMMARY_KEYS = ["file_path", "command", "pattern", "path", "url"];

const FINAL_ANSWER_POINTER: TranscriptEntry = { kind: "tool", text: "Final answer, shown under Answer" };

/** The final answer the result event repeats is shown once, under Answer: its spoken copy here becomes a pointer to it. */
export function transcriptEntries(lines: readonly RunOutput[]): TranscriptEntry[] {
  const finals = new Set(lines.flatMap((line) => finalTextOf(line.text)));

  return lines.flatMap(entriesOfLine).map((entry) => (entry.kind === "said" && finals.has(entry.text) ? FINAL_ANSWER_POINTER : entry));
}

function finalTextOf(text: string): string[] {
  const event = parsedEvent(text);

  return event?.type === "result" && typeof event.result === "string" ? [event.result] : [];
}

function entriesOfLine(line: RunOutput): TranscriptEntry[] {
  if (line.stream === "stderr") return [{ kind: "error", text: line.text }];
  const event = parsedEvent(line.text);

  return event ? entriesOfEvent(event) : [{ kind: "raw", text: line.text }];
}

function entriesOfEvent(event: Fields): TranscriptEntry[] {
  if (event.type === "result") return [{ kind: "result", text: resultSummary(event) }];
  if (event.type === "assistant" || event.type === "user") return contentOf(event).flatMap(entryOfBlock);

  return [];
}

function entryOfBlock(block: Fields): TranscriptEntry[] {
  if (block.type === "text") return [{ kind: "said", text: String(block.text) }];
  if (block.type === "tool_use") return [{ kind: "tool", text: toolLine(String(block.name), asFields(block.input)) }];

  return block.type === "tool_result" && block.is_error === true ? [{ kind: "error", text: resultText(block.content) }] : [];
}

/** The tool's name and the one argument that says what it touched. */
function toolLine(name: string, input: Fields): string {
  const key = SUMMARY_KEYS.find((candidate) => typeof input[candidate] === "string");

  return key ? `${name} ${String(input[key])}` : name;
}

function resultSummary(event: Fields): string {
  const seconds = (Number(event.duration_ms) / MS_PER_SECOND).toFixed(1);

  return `${String(event.num_turns)} turns, ${seconds} s, $${Number(event.total_cost_usd).toFixed(COST_DIGITS)}`;
}

function resultText(content: unknown): string {
  return Array.isArray(content) ? content.map((part) => String(asFields(part).text ?? "")).join("\n") : String(content);
}

function contentOf(event: Fields): Fields[] {
  const content = asFields(event.message).content;

  return Array.isArray(content) ? content.map(asFields) : [];
}

function parsedEvent(text: string): Fields | undefined {
  try {
    const parsed: unknown = JSON.parse(text);

    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Fields) : undefined;
  } catch {
    return undefined;
  }
}

function asFields(value: unknown): Fields {
  return typeof value === "object" && value !== null ? (value as Fields) : {};
}
