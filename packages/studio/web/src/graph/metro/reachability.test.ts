import { describe, expect, it } from "vitest";
import type { AssemblyLineDefinition } from "../assembly-line-definition";
import { implementationDefinition } from "../definition.fixtures";
import { reachabilityOf } from "./reachability";

describe("reachabilityOf", () => {
  it("returns no unreachable stations and no dangling edges when every station is reachable and every edge lands on a node", () => {
    expect(reachabilityOf(implementationDefinition)).toEqual({
      unreachable: new Set(),
      danglingEdges: new Set(),
    });
  });

  it("returns archive as unreachable when no edge leads to it", () => {
    const definition: AssemblyLineDefinition = {
      name: "orphaned",
      description: "A line with a station nothing leads to.",
      version: 1,
      entry: "a",
      exit: "done",
      nodes: [
        { id: "a", type: "marker" },
        { id: "done", type: "marker" },
        { id: "archive", type: "marker" },
      ],
      edges: [{ from: "a", to: "done", on: "success" }],
    };

    expect(reachabilityOf(definition)).toEqual({
      unreachable: new Set(["archive"]),
      danglingEdges: new Set(),
    });
  });

  it("returns the escalation edge as dangling and no unreachable stations when triage escalates to an undeclared node", () => {
    const definition: AssemblyLineDefinition = {
      name: "dangling",
      description: "A line with an edge to a node nobody declared.",
      version: 1,
      entry: "triage",
      exit: "done",
      nodes: [
        { id: "triage", type: "marker" },
        { id: "done", type: "marker" },
      ],
      edges: [
        { from: "triage", to: "done", on: "success" },
        { from: "triage", to: "escalation", on: "escalated" },
      ],
    };

    expect(reachabilityOf(definition)).toEqual({
      unreachable: new Set(),
      danglingEdges: new Set(["triage|escalation|escalated"]),
    });
  });

  it("returns the failed edge from ghost as dangling when ghost is an undeclared node", () => {
    const definition: AssemblyLineDefinition = {
      name: "ghost-source",
      description: "A line with an edge from a node nobody declared.",
      version: 1,
      entry: "a",
      exit: "done",
      nodes: [
        { id: "a", type: "marker" },
        { id: "done", type: "marker" },
      ],
      edges: [
        { from: "a", to: "done", on: "success" },
        { from: "ghost", to: "done", on: "failed" },
      ],
    };

    expect(reachabilityOf(definition)).toEqual({
      unreachable: new Set(),
      danglingEdges: new Set(["ghost|done|failed"]),
    });
  });

  it("returns no unreachable stations when an outside start with no incoming edge leads to report", () => {
    const definition: AssemblyLineDefinition = {
      name: "manual-validation",
      description: "A line with a station a person starts by hand.",
      version: 1,
      entry: "a",
      exit: "done",
      nodes: [
        { id: "a", type: "marker" },
        { id: "done", type: "marker" },
        { id: "validate", type: "marker", outsideStart: "manual.plan.validate" },
        { id: "report", type: "marker" },
      ],
      edges: [
        { from: "a", to: "done", on: "success" },
        { from: "validate", to: "report", on: "always" },
        { from: "report", to: "done", on: "success" },
      ],
    };

    expect(reachabilityOf(definition)).toEqual({
      unreachable: new Set(),
      danglingEdges: new Set(),
    });
  });
});
