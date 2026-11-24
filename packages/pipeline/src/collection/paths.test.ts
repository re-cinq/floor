import { describe, expect, it } from "vitest";
import { agentFileOf, isCollectionFile, isReadPath, pipelineFolderOf } from "./paths.js";

describe("pipelineFolderOf", () => {
  it.each([
    ["code-review/assembly-line.yaml", "code-review"],
    ["stock/code-review/assembly-line.yaml", "code-review"],
    ["code-review/pipeline.yaml", "code-review"],
    ["agents/assembly-line.yaml", "agents"],
    ["code-review/pipeline.yml", undefined],
    ["pipeline.yaml", undefined],
    ["code-review/agents/pipeline.yaml", undefined],
    ["skills/assembly-line.yaml", undefined],
    ["agent-skills/assembly-line.yaml", undefined],
    ["stock/code-review/pipeline.yaml", "code-review"],
    ["stock/ours/code-review/assembly-line.yaml", undefined],
    ["stock/../assembly-line.yaml", undefined],
    ["../stock/code-review/assembly-line.yaml", undefined],
    ["stock/./code-review/assembly-line.yaml", undefined],
    ["stock//code-review/assembly-line.yaml", undefined],
    ["skills/code-review/assembly-line.yaml", undefined],
    ["stock/skills/assembly-line.yaml", undefined],
    ["stock/agents/assembly-line.yaml", undefined],
  ])("returns %s for the path %s", (path, folder) => {
    expect(pipelineFolderOf(path)).toEqual(folder);
  });
});

describe("agentFileOf", () => {
  it.each([
    ["code-review/agents/reviewer.md", { agent: "reviewer", isExtension: false }],
    ["stock/code-review/agents/reviewer.md", { agent: "reviewer", isExtension: false }],
    ["code-review/agents/reviewer.extra.md", { agent: "reviewer", isExtension: true }],
    ["code-review/agents/deep.reviewer.md", { agent: "deep.reviewer", isExtension: false }],
    ["code-review/agent/reviewer.md", undefined],
    ["agents/reviewer.md", undefined],
    ["code-review/agents/reviewer.txt", undefined],
    ["stock/code-review/agents/reviewer.extra.md", { agent: "reviewer", isExtension: true }],
    ["stock/agents/reviewer.md", { agent: "reviewer", isExtension: false }],
    ["stock/ours/code-review/agents/reviewer.md", undefined],
    ["stock/../agents/reviewer.md", undefined],
    ["agent-skills/code-review/agents/reviewer.md", undefined],
  ])("reads the path %s as %j", (path, read) => {
    expect(agentFileOf(path)).toEqual(read);
  });
});

describe("isCollectionFile", () => {
  it.each([
    ["code-review/assembly-line.yaml", true],
    ["code-review/agent/reviewer.md", true],
    ["code-review/notes.yml", true],
    ["README.md", false],
    ["docs/guide.md", false],
    [".github/workflows/lint.yml", false],
    ["code-review/image.png", false],
    ["skills/tdd-start.md", false],
    ["agent-skills/skills/tdd-loop/SKILL.md", false],
  ])("answers %s for the path %s", (path, expected) => {
    expect(isCollectionFile(path)).toEqual(expected);
  });
});

describe("isReadPath", () => {
  it.each([
    ["code-review/assembly-line.yaml", true],
    ["code-review/agents/reviewer.md", true],
    ["code-review/agents/reviewer.extra.md", true],
    ["code-review/agent/reviewer.md", false],
    ["code-review/notes.md", false],
    ["stock/code-review/assembly-line.yaml", true],
    ["stock/code-review/agents/reviewer.md", true],
    ["stock/code-review/notes.md", false],
  ])("answers %s for the path %s", (path, expected) => {
    expect(isReadPath(path)).toEqual(expected);
  });

  it("answers false for the dot folders ../assembly-line.yaml, ./assembly-line.yaml and ../agents/w.md", () => {
    const dotFolderPaths = ["../assembly-line.yaml", "./assembly-line.yaml", "../agents/w.md"];

    expect(dotFolderPaths.map(isReadPath)).toEqual([false, false, false]);
  });
});
