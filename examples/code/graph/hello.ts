// Describe the Hello World line and a completed visit so the graph can draw the route it took.
import type { AssemblyLineDefinition, Visit } from "@re-cinq/floor-graph";

// Nodes and edges use line-local IDs. https://re-cinq.github.io/floor/sdk/graph/#assemblylinedefinition
export const definition: AssemblyLineDefinition = {
  name: "hello-world",
  description: "Greet a person by name",
  version: 1,
  entry: "greet",
  exit: "done",
  fail: "broken",
  nodes: [
    { id: "greet", type: "service", station: "hello", description: "Produces a greeting from the supplied name." },
    { id: "done", type: "marker", description: "The greeting was produced." },
    { id: "broken", type: "marker", description: "The greeting failed." },
  ],
  edges: [
    { from: "greet", to: "done", on: "success" },
    { from: "greet", to: "broken", on: "failed" },
  ],
};

// A closed visit with the success outcome takes the edge from greet to done. https://re-cinq.github.io/floor/sdk/graph/#visit
export const visits: Visit[] = [{ nodeId: "greet", iteration: 1, outcome: "success", open: false }];
