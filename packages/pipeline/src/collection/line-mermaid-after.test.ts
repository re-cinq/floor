import type { LineBody } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import {
  escapedLine,
  solveTaskBase,
  solveTaskHead,
} from "./line-mermaid.fixtures.js";
import { afterGraphOf } from "./line-mermaid.js";

describe("afterGraphOf", () => {
  it("draws head left to right, adds the new node and edges, ambers the recapped edge and leaves the removed edge out", () => {
    expect(afterGraphOf(solveTaskBase, solveTaskHead)).toEqual(
      [
        "flowchart LR",
        '  attempt["attempt"]',
        '  review["review"]',
        '  done["done"]',
        '  attempt -->|"success"| review',
        '  review -->|"success"| done',
        '  review -->|"failed"| attempt',
        '  attempt -->|"failed (max 5)"| attempt',
        "  classDef added stroke:#2da44e,stroke-width:3px",
        "  class review added",
        "  linkStyle 0 stroke:#2da44e,stroke-width:3px",
        "  linkStyle 1 stroke:#2da44e,stroke-width:3px",
        "  linkStyle 2 stroke:#2da44e,stroke-width:3px",
        "  linkStyle 3 stroke:#bf8700,stroke-width:3px",
      ].join("\n"),
    );
  });

  it("draws nodes with another station as changed in head's order, after the added ones", () => {
    const baseLine: LineBody = {
      entry: "first",
      exit: "second",
      args: {},
      nodes: [
        { id: "first", station: "worker" },
        { id: "second", station: "worker" },
      ],
      edges: [],
    };
    const headLine: LineBody = {
      ...baseLine,
      nodes: [
        { id: "second", station: "reviewer" },
        { id: "first", station: "reviewer" },
        { id: "third" },
      ],
    };

    expect(afterGraphOf(baseLine, headLine)).toEqual(
      [
        "flowchart LR",
        '  second["second"]',
        '  first["first"]',
        '  third["third"]',
        "  classDef added stroke:#2da44e,stroke-width:3px",
        "  class third added",
        "  classDef changed stroke:#bf8700,stroke-width:3px",
        "  class second,first changed",
      ].join("\n"),
    );
  });

  it("draws every node and edge as added when base is undefined", () => {
    const headLine: LineBody = {
      entry: "plan",
      exit: "ship",
      args: {},
      nodes: [{ id: "plan" }, { id: "ship" }],
      edges: [{ from: "plan", to: "ship", on: "success" }],
    };

    expect(afterGraphOf(undefined, headLine)).toEqual(
      [
        "flowchart LR",
        '  plan["plan"]',
        '  ship["ship"]',
        '  plan -->|"success"| ship',
        "  classDef added stroke:#2da44e,stroke-width:3px",
        "  class plan,ship added",
        "  linkStyle 0 stroke:#2da44e,stroke-width:3px",
      ].join("\n"),
    );
  });

  it("escapes a node id and an edge label with quotes, angle brackets and a pipe", () => {
    expect(afterGraphOf(escapedLine, escapedLine)).toEqual(
      [
        "flowchart LR",
        '  check__pr___v2_["check #quot;pr#quot; #lt;v2#gt;"]',
        '  done["done"]',
        '  check__pr___v2_ -->|"needs #quot;fix#quot; #lt;2#124;3#gt;"| done',
      ].join("\n"),
    );
  });
});
