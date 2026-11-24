// An agent's final answer, read for a person: its words as text, and each JSON object in it, alone on its lines or fenced, as data to lay out. The LORE_NODE_RESULT line is left out: the run's outcome already says it.
import type { RunOutput } from "./use-run";

export type AnswerPart = { kind: "text"; text: string } | { kind: "json"; value: unknown };

const FENCED = /```[a-z]*\n([\s\S]*?)```/g;
const MARKER_LINE = /^LORE_NODE_RESULT:.*$/gm;
const PARAGRAPH_BREAK = /\n\s*\n/;

export function answerParts(text: string): AnswerPart[] {
  const unmarked = text.replace(MARKER_LINE, "");
  const blocks = unmarked.split(FENCED).flatMap((block, index) => (index % 2 === 1 ? [block] : block.split(PARAGRAPH_BREAK)));

  return blocks.map((block) => block.trim()).filter(Boolean).map(partOf);
}

/** The text of the run's last `result` event: what the agent answered. */
export function finalAnswer(lines: readonly RunOutput[]): string | undefined {
  const results = lines.flatMap((line) => resultTextOf(line.text));

  return results.at(-1);
}

function partOf(block: string): AnswerPart {
  const value = /^[[{]/.test(block) ? parsed(block) : undefined;

  return value === undefined ? { kind: "text", text: block } : { kind: "json", value };
}

function resultTextOf(text: string): string[] {
  const event = parsed(text) as { type?: unknown; result?: unknown } | undefined;

  return event?.type === "result" && typeof event.result === "string" ? [event.result] : [];
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
