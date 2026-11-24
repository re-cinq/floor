import { describe, expect, it } from "vitest";
import { TRIAGE_AGENT, linesAndRefusalsOf, overlayOf, pipelineYaml } from "./collection.fixtures.js";

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
