import { describe, expect, it } from "vitest";
import { linesAndRefusalsOf, pipelineYaml } from "./collection.fixtures.js";

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
});
