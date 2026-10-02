import type { LineArgSpec } from "./types.js";

// Which of a line's arguments are of kind git, in the order the line declares them.
export function gitArgNames(args: Record<string, LineArgSpec>): string[] {
  return Object.keys(args).filter((name) => args[name].kind === "git");
}
