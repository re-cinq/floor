// Define the Hello World line and its station catalogue so an editor can check it before import.
import { validateLine, type KnownDefinitions, type WalkGraph } from "@re-cinq/floor-assembly-lines";
import type { LineBody } from "@re-cinq/floor-contracts";

export const line: LineBody = {
  entry: "greet", exit: "done", fail: "broken",
  args: { name: { kind: "value", subject: true } },
  nodes: [{ id: "greet", station: "hello" }, { id: "done" }, { id: "broken" }],
  edges: [
    { from: "greet", to: "done", on: "success" },
    { from: "greet", to: "broken", on: "failed" },
  ],
};

export const catalogue: KnownDefinitions = {
  stations: new Set(["hello"]),
  bodies: new Map([["hello", {
    kind: "service", outcomes: ["success", "failed"],
    needs: [{ name: "name", kind: "value" }], produces: [{ name: "greeting", kind: "value" }],
  }]]),
};

// validateLine takes the line body and the known station definitions. https://re-cinq.github.io/floor/sdk/assembly-lines/#knowndefinitions
export const problems = validateLine(line, catalogue);

// The walker uses the same entry, terminal nodes and edges. https://re-cinq.github.io/floor/sdk/assembly-lines/#walkgraph
export const graph: WalkGraph = { name: "hello-world", entry: line.entry, exit: line.exit, fail: line.fail, edges: line.edges };
