// What opening a node of the line means in a local test run: an agent runs, a person stands in, or nothing happens.
import { nodeAt, stationOfNode, type TestLine } from "./test-line.js";

export type VisitKind = "agent" | "stand-in" | "marker";

export function visitKindOf(line: TestLine, nodeId: string): VisitKind {
  const node = nodeAt(line, nodeId);

  if (node.station === undefined) {
    return "marker";
  }

  return stationOfNode(line, node).kind === "agent" ? "agent" : "stand-in";
}
