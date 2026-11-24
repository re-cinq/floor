import { describe, expect, it } from "vitest";
import { TRIAGE_AGENT, agentNamed, linesAndRefusalsOf, overlayOf, pipelineYaml } from "./collection.fixtures.js";

describe("collectionOverlay with group folders", () => {
  it("refuses stock/code-review as a second line code-review when ours/code-review already sets it", () => {
    expect(linesAndRefusalsOf({
      "ours/code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"),
      "stock/code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"),
    })).toEqual({
      lines: ["code-review"],
      refused: [
        {
          path: "stock/code-review/assembly-line.yaml",
          reason: "code-review is already set by ours/code-review/assembly-line.yaml",
        },
      ],
    });
  });

  it("refuses stock/code-review/pipeline.yaml as already set, not as held twice, when ours/code-review holds assembly-line.yaml", () => {
    const reviewYaml = pipelineYaml("code-review", "reviewer");

    expect(linesAndRefusalsOf({
      "ours/code-review/assembly-line.yaml": reviewYaml,
      "stock/code-review/pipeline.yaml": reviewYaml,
    })).toEqual({
      lines: ["code-review"],
      refused: [
        {
          path: "stock/code-review/pipeline.yaml",
          reason: "code-review is already set by ours/code-review/assembly-line.yaml",
        },
      ],
    });
  });

  it("refuses stock/code-review/assembly-line.yaml below stock, which holds a line, and reads only stock", () => {
    expect(linesAndRefusalsOf({
      "stock/assembly-line.yaml": pipelineYaml("stock", "reviewer"),
      "stock/code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"),
    })).toEqual({
      lines: ["stock"],
      refused: [{
        path: "stock/code-review/assembly-line.yaml",
        reason: "the folder stock holds a line, so it is not a group: move code-review out of it",
      }],
    });
  });

  it("lists alpha before zeta when ours/zeta and stock/alpha are read, ordering by line name not path", () => {
    expect(linesAndRefusalsOf({
      "ours/zeta/assembly-line.yaml": pipelineYaml("zeta", "reviewer"),
      "stock/alpha/assembly-line.yaml": pipelineYaml("alpha", "reviewer"),
    })).toEqual({ lines: ["alpha", "zeta"], refused: [] });
  });

  it("reads stock/triage with its agent triager as the line triage, the same overlay as the top-level folder triage gives", () => {
    const grouped = overlayOf({
      "stock/triage/assembly-line.yaml": pipelineYaml("triage", "triager"),
      "stock/triage/agents/triager.md": TRIAGE_AGENT,
    });
    const flat = overlayOf({
      "triage/assembly-line.yaml": pipelineYaml("triage", "triager"),
      "triage/agents/triager.md": TRIAGE_AGENT,
    });

    expect({ overlay: grouped, lines: grouped.pipelines.map((pipeline) => pipeline.line?.id), refused: grouped.refused }).toEqual({ overlay: flat, lines: ["triage"], refused: [] });
  });

  it("refuses stock/code-review as a second line code-review when the top-level folder code-review already sets it", () => {
    const reviewYaml = pipelineYaml("code-review", "reviewer");

    expect(linesAndRefusalsOf({ "code-review/assembly-line.yaml": reviewYaml, "stock/code-review/assembly-line.yaml": reviewYaml }).refused).toEqual([
      { path: "stock/code-review/assembly-line.yaml", reason: "code-review is already set by code-review/assembly-line.yaml" },
    ]);
  });

  it("reads ours/triage and refuses the top-level folder triage, since the path ours/triage sorts first", () => {
    const triageYaml = pipelineYaml("triage", "reviewer");

    expect(linesAndRefusalsOf({ "triage/assembly-line.yaml": triageYaml, "ours/triage/assembly-line.yaml": triageYaml }).refused).toEqual([
      { path: "triage/assembly-line.yaml", reason: "triage is already set by ours/triage/assembly-line.yaml" },
    ]);
  });

  it("reads no line and refuses both files when ours/code-review holds the line sorting and stock/code-review holds code-review", () => {
    expect(linesAndRefusalsOf({
      "ours/code-review/assembly-line.yaml": pipelineYaml("sorting", "reviewer"),
      "stock/code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"),
    })).toEqual({
      lines: [],
      refused: [
        { path: "ours/code-review/assembly-line.yaml", reason: "the folder code-review must hold the pipeline of that name, and its line is sorting" },
        { path: "stock/code-review/assembly-line.yaml", reason: "code-review is already set by ours/code-review/assembly-line.yaml" },
      ],
    });
  });

  it("refuses stock/triage/agents/triager.md when ours/triage/agents/triager.md already sets the agent triager", () => {
    const overlay = overlayOf({ "ours/triage/agents/triager.md": TRIAGE_AGENT, "stock/triage/agents/triager.md": TRIAGE_AGENT });

    expect(overlay.refused).toEqual([{ path: "stock/triage/agents/triager.md", reason: "triager is already set by ours/triage/agents/triager.md" }]);
  });

  it("refuses stock/README.md and stock/code-review/notes.md as paths a collection does not read", () => {
    const reason = "a collection does not read this path: a line folder holds assembly-line.yaml, agents/<agent>.md and agents/<agent>.extra.md";

    expect(linesAndRefusalsOf({ "stock/README.md": "Notes.", "stock/code-review/notes.md": "Notes." }).refused).toEqual([
      { path: "stock/code-review/notes.md", reason },
      { path: "stock/README.md", reason },
    ]);
  });

  it("refuses stock/code-review/pipeline.yaml as held twice when stock/code-review/assembly-line.yaml sits beside it", () => {
    const reviewYaml = pipelineYaml("code-review", "reviewer");

    expect(linesAndRefusalsOf({ "stock/code-review/assembly-line.yaml": reviewYaml, "stock/code-review/pipeline.yaml": reviewYaml })).toEqual({
      lines: ["code-review"],
      refused: [{ path: "stock/code-review/pipeline.yaml", reason: "the folder code-review holds its line twice: assembly-line.yaml is read, so remove pipeline.yaml" }],
    });
  });
});

describe("collectionOverlay with declared groups", () => {
  const REVIEW_IN_BOTH = {
    "ours/code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"),
    "stock/code-review/assembly-line.yaml": pipelineYaml("code-review", "merger"),
  };

  function readWith(files: Record<string, string>, groups: readonly string[]) {
    const overlay = overlayOf(files, groups);

    return {
      lines: overlay.pipelines.map((pipeline) => pipeline.line?.id),
      agentOfLine: overlay.pipelines.map(({ stations: [station] }) => station.body.agentDefinition),
      refused: overlay.refused,
    };
  }

  it("reads only ours/code-review and refuses nothing when groups are stock then ours and both hold code-review", () => {
    expect(readWith(REVIEW_IN_BOTH, ["stock", "ours"])).toEqual({ lines: ["code-review"], agentOfLine: ["reviewer"], refused: [] });
  });

  it("reads only stock/code-review and refuses nothing when groups are ours then stock", () => {
    expect(readWith(REVIEW_IN_BOTH, ["ours", "stock"])).toEqual({ lines: ["code-review"], agentOfLine: ["merger"], refused: [] });
  });

  it("refuses stock/code-review as already set when groups lists only stock, since ours is not listed", () => {
    expect(readWith(REVIEW_IN_BOTH, ["stock"])).toEqual({
      lines: ["code-review"],
      agentOfLine: ["reviewer"],
      refused: [{ path: "stock/code-review/assembly-line.yaml", reason: "code-review is already set by ours/code-review/assembly-line.yaml" }],
    });
  });

  it("refuses stock/code-review as already set by the top-level folder code-review, which no list of groups outranks", () => {
    const files = { "code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"), "stock/code-review/assembly-line.yaml": pipelineYaml("code-review", "merger") };

    expect(readWith(files, ["stock"])).toEqual({
      lines: ["code-review"],
      agentOfLine: ["reviewer"],
      refused: [{ path: "stock/code-review/assembly-line.yaml", reason: "code-review is already set by code-review/assembly-line.yaml" }],
    });
  });

  it("reads triager from stock/triage/agents/triager.md and refuses nothing when groups are ours then stock and both hold it", () => {
    const overlay = overlayOf({
      "ours/triage/agents/triager.md": TRIAGE_AGENT,
      "stock/triage/agents/triager.md": TRIAGE_AGENT.replace("timeout_minutes: 10", "timeout_minutes: 20"),
    }, ["ours", "stock"]);

    expect({ timeout_minutes: agentNamed(overlay, "triager")?.settings.timeout_minutes, refused: overlay.refused }).toEqual({ timeout_minutes: 20, refused: [] });
  });

  it("reads the full file stock/triage/agents/triager.md and leaves out the extension ours/triage/agents/triager.extra.md when groups are ours then stock", () => {
    const overlay = overlayOf({ "ours/triage/agents/triager.extra.md": "Also sort by age.", "stock/triage/agents/triager.md": TRIAGE_AGENT }, ["ours", "stock"]);

    expect({ source: agentNamed(overlay, "triager")?.source, refused: overlay.refused }).toEqual({ source: "collection-new", refused: [] });
  });

  it("refuses stock/code-review as nested below the line folder stock and reads ours/code-review when groups are stock then ours", () => {
    const files = {
      "stock/assembly-line.yaml": pipelineYaml("stock", "reviewer"),
      "stock/code-review/assembly-line.yaml": pipelineYaml("code-review", "merger"),
      "ours/code-review/assembly-line.yaml": pipelineYaml("code-review", "reviewer"),
    };

    expect(readWith(files, ["stock", "ours"])).toEqual({
      lines: ["code-review", "stock"],
      agentOfLine: ["reviewer", "reviewer"],
      refused: [{ path: "stock/code-review/assembly-line.yaml", reason: "the folder stock holds a line, so it is not a group: move code-review out of it" }],
    });
  });
});
