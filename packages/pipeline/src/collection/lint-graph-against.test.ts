import { describe, expect, it } from "vitest";
import { pipelineYaml } from "./collection.fixtures.js";
import {
  collectionOnDisk,
  NEW_AGENT,
} from "./collection-directory.fixtures.js";
import { lintCommand } from "./lint-directory.js";

describe("lintCommand with graphAgainstDirectory", () => {
  const USAGE = "floor-pipeline lint <dir>";

  async function lintGraphed(baseYaml: string, headYaml: string) {
    const [base, head] = [baseYaml, headYaml].map((yaml) =>
      collectionOnDisk({
        "acme-flow/assembly-line.yaml": yaml,
        "acme-flow/agents/acme-worker.md": NEW_AGENT,
      }),
    );
    const out: string[] = [];
    const err: string[] = [];

    const code = await lintCommand(
      { directory: head, hostKeys: [], graphAgainstDirectory: base },
      USAGE,
      { out: (line) => out.push(line), err: (line) => err.push(line) },
    );

    return { code, out, err };
  }

  it("prints only the change report to out and collection ok to err for a head line that gains the node review", async () => {
    const baseYaml = pipelineYaml("acme-flow", "acme-worker");
    const headYaml = baseYaml
      .replace("    - id: done\n", "    - id: done\n    - id: review\n")
      .replace(
        "      to: done\n",
        "      to: review\n      on: success\n    - from: review\n      to: done\n",
      );
    const { code, out, err } = await lintGraphed(baseYaml, headYaml);

    const report = [
      "<!-- floor-pack-graph -->",
      "### Assembly lines changed in this pull request",
      "",
      "**acme-flow** · before",
      "",
      "```mermaid",
      "flowchart LR",
      '  work["work"]',
      '  done["done"]',
      '  work -->|"success"| done',
      '  work -->|"failed (max 1)"| work',
      "  linkStyle 0 stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
      "```",
      "",
      "**acme-flow** · proposed changes",
      "",
      "```mermaid",
      "flowchart LR",
      '  work["work"]',
      '  done["done"]',
      '  review["review"]',
      '  work -->|"success"| review',
      '  review -->|"success"| done',
      '  work -->|"failed (max 1)"| work',
      "  classDef added stroke:#2da44e,stroke-width:3px",
      "  class review added",
      "  linkStyle 0 stroke:#2da44e,stroke-width:3px",
      "  linkStyle 1 stroke:#2da44e,stroke-width:3px",
      "```",
      "",
      "<sub>green added · red dashed removed · amber changed</sub>",
      "",
    ].join("\n");

    expect({ code, out, err }).toEqual({
      code: 0,
      out: [report],
      err: ["collection ok: 1 agents, 1 pipelines, 0 extensions"],
    });
  });

  it("prints only the refusal to err and exits 1 for a head line whose new node review has no edge out", async () => {
    const baseYaml = pipelineYaml("acme-flow", "acme-worker");
    const headYaml = baseYaml.replace(
      "    - id: done\n",
      "    - id: done\n    - id: review\n",
    );
    const { code, out, err } = await lintGraphed(baseYaml, headYaml);

    expect({ code, out, err }).toEqual({
      code: 1,
      out: [],
      err: [
        "acme-flow/assembly-line.yaml: no edge leaves it and it is neither the line's exit nor its fail node, so a run reaching it stops with nothing to do; no edge and no start event reaches it, so no run ever visits it",
      ],
    });
  });

  it("prints no report and exits 0 for a valid head compared with a refused base", async () => {
    const headYaml = pipelineYaml("acme-flow", "acme-worker");
    const baseYaml = headYaml.replace(
      "    - id: done\n",
      "    - id: done\n    - id: review\n",
    );
    const { code, out, err } = await lintGraphed(baseYaml, headYaml);
    const noReport =
      "no change report: the collection to compare with is refused";

    expect({ code, out, err }).toEqual({
      code: 0,
      out: [],
      err: ["collection ok: 1 agents, 1 pipelines, 0 extensions", noReport],
    });
  });
});
