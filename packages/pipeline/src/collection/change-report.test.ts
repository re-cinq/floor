import { describe, expect, it } from "vitest";
import { changeReportOf } from "./change-report.js";
import type { LineChange } from "./changed-lines.js";
import { solveTaskBase, solveTaskHead } from "./line-mermaid.fixtures.js";

const heading = [
  "<!-- floor-pack-graph -->",
  "### Assembly lines changed in this pull request",
  "",
];
const legend = [
  "<sub>green added · red dashed removed · amber changed</sub>",
  "",
];
const baseBeforeBlock = [
  "```mermaid",
  "flowchart LR",
  '  attempt["attempt"]',
  '  done["done"]',
  '  attempt -->|"success"| done',
  '  attempt -->|"failed (max 3)"| attempt',
  "  linkStyle 0 stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
  "  linkStyle 1 stroke:#bf8700,stroke-width:3px",
  "```",
  "",
];
const changedAfterBlock = [
  "```mermaid",
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
  "```",
  "",
];
const headOnlyAfterBlock = [
  "```mermaid",
  "flowchart LR",
  '  attempt["attempt"]',
  '  review["review"]',
  '  done["done"]',
  '  attempt -->|"success"| review',
  '  review -->|"success"| done',
  '  review -->|"failed"| attempt',
  '  attempt -->|"failed (max 5)"| attempt',
  "  classDef added stroke:#2da44e,stroke-width:3px",
  "  class attempt,review,done added",
  "  linkStyle 0 stroke:#2da44e,stroke-width:3px",
  "  linkStyle 1 stroke:#2da44e,stroke-width:3px",
  "  linkStyle 2 stroke:#2da44e,stroke-width:3px",
  "  linkStyle 3 stroke:#2da44e,stroke-width:3px",
  "```",
  "",
];

describe("changeReportOf", () => {
  it("renders a before graph and a proposed changes graph for a changed line", () => {
    expect(
      changeReportOf([
        {
          id: "solve",
          base: { ...solveTaskBase },
          head: { ...solveTaskHead },
        },
      ]),
    ).toEqual(
      [
        ...heading,
        "**solve** · before",
        "",
        ...baseBeforeBlock,
        "**solve** · proposed changes",
        "",
        ...changedAfterBlock,
        ...legend,
      ].join("\n"),
    );
  });

  it("returns an empty string for no changed lines", () => {
    expect(changeReportOf([])).toEqual("");
  });

  it("renders only proposed changes for a head-only line, only before for a base-only line, and one legend", () => {
    expect(
      changeReportOf([
        { id: "deploy", head: { ...solveTaskHead } },
        { id: "retire", base: { ...solveTaskBase } },
      ]),
    ).toEqual(
      [
        ...heading,
        "**deploy** · proposed changes",
        "",
        ...headOnlyAfterBlock,
        "**retire** · before",
        "",
        "```mermaid",
        "flowchart LR",
        '  attempt["attempt"]',
        '  done["done"]',
        '  attempt -->|"success"| done',
        '  attempt -->|"failed (max 3)"| attempt',
        "  classDef removed stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
        "  class attempt,done removed",
        "  linkStyle 0 stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
        "  linkStyle 1 stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
        "```",
        "",
        ...legend,
      ].join("\n"),
    );
  });

  it("draws build and names deploy in a note when only one line fits the limit", () => {
    expect(
      changeReportOf(
        [
          {
            id: "build",
            base: { ...solveTaskBase },
            head: { ...solveTaskHead },
          },
          {
            id: "deploy",
            base: { ...solveTaskBase },
            head: { ...solveTaskHead },
          },
        ],
        1000,
      ),
    ).toEqual(
      [
        ...heading,
        "**build** · before",
        "",
        ...baseBeforeBlock,
        "**build** · proposed changes",
        "",
        ...changedAfterBlock,
        "These lines changed too, but their graphs would not fit in one comment: `deploy`.",
        "",
        ...legend,
      ].join("\n"),
    );
  });

  it("names every line in the note and draws no graph when no graph fits the limit", () => {
    expect(changeReportOf(changedLinesOf(["build", "deploy"]), 300)).toEqual(
      [
        ...heading,
        "These lines changed too, but their graphs would not fit in one comment: `build`, `deploy`.",
        "",
        ...legend,
      ].join("\n"),
    );
  });

  it("lists only the ids that fit and ends with and 3 more when the note would pass the limit", () => {
    const limit = 240;
    const report = changeReportOf(
      changedLinesOf(["alpha", "beta", "gamma", "delta", "epsilon"]),
      limit,
    );

    expect({ report, fitsLimit: report.length <= limit }).toEqual({
      report: [
        ...heading,
        "These lines changed too, but their graphs would not fit in one comment: `alpha`, `beta` and 3 more.",
        "",
        ...legend,
      ].join("\n"),
      fitsLimit: true,
    });
  });
});

function changedLinesOf(ids: string[]): LineChange[] {
  return ids.map((id) => ({
    id,
    base: { ...solveTaskBase },
    head: { ...solveTaskHead },
  }));
}
