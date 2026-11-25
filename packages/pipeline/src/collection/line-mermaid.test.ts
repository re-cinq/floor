import type { LineBody } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import {
  escapedLine,
  solveTaskBase,
  solveTaskHead,
} from "./line-mermaid.fixtures.js";
import { beforeGraphOf } from "./line-mermaid.js";

const baseLine: LineBody = {
  entry: "work",
  exit: "work",
  args: {},
  nodes: [{ id: "work", station: "worker" }],
  edges: [],
};

describe("beforeGraphOf", () => {
  it("draws base left to right, dashes the removed edge, ambers the recapped edge and leaves head's additions out", () => {
    expect(beforeGraphOf(solveTaskBase, solveTaskHead)).toEqual(
      [
        "flowchart LR",
        '  attempt["attempt"]',
        '  done["done"]',
        '  attempt -->|"success"| done',
        '  attempt -->|"failed (max 3)"| attempt',
        "  linkStyle 0 stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
        "  linkStyle 1 stroke:#bf8700,stroke-width:3px",
      ].join("\n"),
    );
  });

  it("draws every node and edge as removed when head is undefined", () => {
    expect(beforeGraphOf(baseLine, undefined)).toEqual(
      [
        "flowchart LR",
        '  work["work"]',
        "  classDef removed stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
        "  class work removed",
      ].join("\n"),
    );
  });

  it("marks a node with another station in head as changed", () => {
    const reviewedLine: LineBody = {
      ...baseLine,
      nodes: [{ id: "work", station: "reviewer" }],
    };

    expect(beforeGraphOf(baseLine, reviewedLine)).toEqual(
      [
        "flowchart LR",
        '  work["work"]',
        "  classDef changed stroke:#bf8700,stroke-width:3px",
        "  class work changed",
      ].join("\n"),
    );
  });

  it("draws an edge carrying both caps with max then unattended in its label", () => {
    const cappedLine: LineBody = {
      ...baseLine,
      edges: [
        {
          from: "work",
          to: "work",
          on: "failed",
          iterationMax: 2,
          unattendedMax: 5,
        },
      ],
    };

    expect(beforeGraphOf(cappedLine, cappedLine)).toEqual(
      [
        "flowchart LR",
        '  work["work"]',
        '  work -->|"failed (max 2) (unattended 5)"| work',
      ].join("\n"),
    );
  });

  it("escapes a node id and an edge label with quotes, angle brackets and a pipe", () => {
    expect(beforeGraphOf(escapedLine, escapedLine)).toEqual(
      [
        "flowchart LR",
        '  check__pr___v2_["check #quot;pr#quot; #lt;v2#gt;"]',
        '  done["done"]',
        '  check__pr___v2_ -->|"needs #quot;fix#quot; #lt;2#124;3#gt;"| done',
      ].join("\n"),
    );
  });
});
