// Lines the engine's test files share, so one fixture never drifts into two copies.
import type { LineBody } from "@floor/store";

/** Walks to its exit with nobody reporting: every node is a marker. */
export const MARKER_LINE: LineBody = {
  entry: "first",
  exit: "done",
  args: {},
  nodes: [{ id: "first" }, { id: "second" }, { id: "done" }],
  edges: [
    { from: "first", to: "second", on: "always" },
    { from: "second", to: "done", on: "always" },
  ],
};
