// Pure: the agent's fenced REVIEW_REPLY block, as posted. The format is lore's. How the block is found is not: lore's ends it at the first fence it meets, which is where an agent that quotes code in its reply opens the quote.

const OPENING = "```REVIEW_REPLY";
const FENCE = "```";

type Fence = "opens" | "closes" | "neither";

interface Reading {
  /** How many fences the agent has opened inside the block and not yet closed. */
  depth: number;
  kept: string[];
  ended: boolean;
}

const DEEPER: Record<Fence, number> = { opens: 1, closes: -1, neither: 0 };

/** The last block the agent printed; an agent that explains the format before using it prints it twice. Null for none, for one never closed, and for one that says nothing. */
export function parseReviewReply(output: string): string | null {
  const lines = output.split("\n");
  const opening = lines.findLastIndex((line) => line.trimEnd() === OPENING);

  if (opening < 0) return null;
  const { kept, ended } = lines.slice(opening + 1).reduce(taken, { depth: 0, kept: [], ended: false });
  const body = kept.join("\n").trim();

  return ended && body.length > 0 ? body : null;
}

// A fence that names a language opens a quote, and a bare one closes whatever is open: the quote, or with none open, the block.
function taken(read: Reading, line: string): Reading {
  if (read.ended) return read;
  const fence = fenceOf(line);

  if (fence === "closes" && read.depth === 0) return { ...read, ended: true };

  return { ...read, depth: read.depth + DEEPER[fence], kept: [...read.kept, line] };
}

function fenceOf(line: string): Fence {
  const written = line.trimEnd();

  if (written === FENCE) return "closes";

  return written.startsWith(FENCE) ? "opens" : "neither";
}
