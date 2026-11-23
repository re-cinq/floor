import { describe, expect, it } from "vitest";
import { collectionOverlay } from "./collection.js";
import { pipelineYaml } from "./collection.fixtures.js";

const AGENT = "---\nimage: acme/agent:2\ntimeout_minutes: 10\n---\nWork the ticket.\n";
const LINE = pipelineYaml("acme-flow", "acme-worker");

function overlayOf(lineFiles: string[]) {
  const files = [...lineFiles.map((path) => ({ path, text: LINE })), { path: "acme-flow/agents/acme-worker.md", text: AGENT }];

  return collectionOverlay({ files, shipped: { pipelines: [], agents: new Map() }, env: {} });
}

describe("the file a line folder holds its line in", () => {
  it("reads a line from assembly-line.yaml", () => {
    expect(overlayOf(["acme-flow/assembly-line.yaml"])).toMatchObject({ refused: [], counts: { pipelines: 1 } });
  });

  it("still reads a line from pipeline.yaml, the name the file had before", () => {
    expect(overlayOf(["acme-flow/pipeline.yaml"])).toMatchObject({ refused: [], counts: { pipelines: 1 } });
  });

  it("refuses pipeline.yaml in a folder that also holds assembly-line.yaml, and reads the line once", () => {
    expect(overlayOf(["acme-flow/pipeline.yaml", "acme-flow/assembly-line.yaml"])).toMatchObject({
      refused: [{ path: "acme-flow/pipeline.yaml", reason: "the folder acme-flow holds its line twice: assembly-line.yaml is read, so remove pipeline.yaml" }],
      counts: { pipelines: 1 },
    });
  });

  it("names assembly-line.yaml when it refuses a path a collection does not read", () => {
    expect(overlayOf(["acme-flow/assembly-line.yml"]).refused).toContainEqual({
      path: "acme-flow/assembly-line.yml",
      reason: "a collection does not read this path: a line folder holds assembly-line.yaml, agents/<agent>.md and agents/<agent>.extra.md",
    });
  });
});
