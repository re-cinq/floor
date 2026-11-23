// Unwraps hard-wrapped markdown paragraphs and list items; blank lines and fenced code stay verbatim.
const FENCE = /^\s*```/;
const BLOCK_START = /^\s*(?:$|[-*] |\d+\. )/;

type LineKind = "fence" | "fenced" | "continuation" | "blockStart";

interface UnwrapState {
  lines: string[];
  inFence: boolean;
  joinable: boolean;
}

const INITIAL: UnwrapState = { lines: [], inFence: false, joinable: false };

export function unwrapParagraphs(text: string): string {
  const { lines } = text.split("\n").reduce(unwrapLine, INITIAL);

  return lines.join("\n");
}

function unwrapLine(state: UnwrapState, line: string): UnwrapState {
  return APPLY[classify(line, state)](state, line);
}

function classify(line: string, state: UnwrapState): LineKind {
  if (FENCE.test(line)) return "fence";
  if (state.inFence) return "fenced";
  if (state.joinable && !BLOCK_START.test(line)) return "continuation";

  return "blockStart";
}

const APPLY: Record<LineKind, (state: UnwrapState, line: string) => UnwrapState> = {
  fence: (state, line) => ({ lines: [...state.lines, line], inFence: !state.inFence, joinable: false }),
  fenced: (state, line) => ({ ...state, lines: [...state.lines, line] }),
  continuation: (state, line) => ({ ...state, lines: joinToLast(state.lines, line) }),
  blockStart: (state, line) => ({ lines: [...state.lines, line], inFence: false, joinable: line.trim() !== "" }),
};

function joinToLast(lines: string[], line: string): string[] {
  return [...lines.slice(0, -1), `${lines.at(-1)} ${line.trim()}`];
}
