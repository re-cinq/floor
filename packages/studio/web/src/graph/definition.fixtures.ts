// Small lines as test fixtures: one that retries, one that does not.
import type { AssemblyLineDefinition } from "./assembly-line-definition";

export const codeReviewDefinition: AssemblyLineDefinition = {
  name: "code-review",
  description: "Review a pull request.",
  version: 1,
  entry: "review",
  exit: "done",
  nodes: [
    { id: "review", type: "agent" },
    { id: "done", type: "marker" },
  ],
  edges: [
    { from: "review", to: "done", on: "success" },
    { from: "review", to: "done", on: "changes_requested" },
    { from: "review", to: "done", on: "failed" },
  ],
};

export const implementationDefinition: AssemblyLineDefinition = {
  name: "implementation",
  description: "Implement a spec, validate, push, review. On changes_requested, address feedback up to 2 iterations.",
  version: 1,
  entry: "implement",
  exit: "done",
  nodes: [
    { id: "implement", type: "agent" },
    { id: "validate", type: "service" },
    { id: "push", type: "agent" },
    { id: "review", type: "agent" },
    { id: "address", type: "agent" },
    { id: "retrospective", type: "marker" },
    { id: "done", type: "marker" },
  ],
  edges: [
    { from: "implement", to: "validate", on: "success" },
    { from: "implement", to: "implement", on: "failed", iterationMax: 1 },
    { from: "implement", to: "retrospective", on: "changes_requested" },
    { from: "validate", to: "push", on: "success" },
    { from: "validate", to: "implement", on: "failed", iterationMax: 1 },
    { from: "push", to: "review", on: "always" },
    { from: "review", to: "retrospective", on: "success" },
    { from: "review", to: "address", on: "changes_requested", iterationMax: 2 },
    { from: "address", to: "validate", on: "always", iterationMax: 2 },
    { from: "review", to: "retrospective", on: "failed" },
    { from: "retrospective", to: "done", on: "always" },
  ],
};

export const builtinDefinitions: AssemblyLineDefinition[] = [codeReviewDefinition, implementationDefinition];
