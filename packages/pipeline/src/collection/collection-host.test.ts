import { describe, expect, it } from "vitest";
import { collectionOverlay } from "./collection.js";
import { SHIPPED, TRIAGE_AGENT, agentNamed, pipelineYaml } from "./collection.fixtures.js";

function overlayOf(files: Record<string, string>, hostKeys?: readonly string[]) {
  return collectionOverlay({ files: Object.entries(files).map(([path, text]) => ({ path, text })), shipped: SHIPPED, env: {}, hostKeys });
}

const HOST_AGENT = "---\nimage: acme/agent:2\ntimeout_minutes: 10\nexecution_mode: station\nreview_required: true\n---\nTriage.\n";

describe("collectionOverlay with host keys", () => {
  it("accepts the frontmatter keys execution_mode and review_required when the host names them, and keeps them out of the settings", () => {
    const overlay = overlayOf({ "triage/agents/triager.md": HOST_AGENT }, ["execution_mode", "review_required"]);

    expect({ refused: overlay.refused, settings: agentNamed(overlay, "triager")?.settings }).toEqual({
      refused: [],
      settings: { image: "acme/agent:2", timeout_minutes: 10, prompt: "Triage.\n" },
    });
  });

  it("refuses execution_mode when the host names no host key", () => {
    const overlay = overlayOf({ "triage/agents/triager.md": HOST_AGENT });

    expect(overlay.refused).toMatchObject([{ path: "triage/agents/triager.md", reason: expect.stringContaining("execution_mode") }]);
  });

  it("refuses review_required when the host names only execution_mode", () => {
    const overlay = overlayOf({ "triage/agents/triager.md": HOST_AGENT }, ["execution_mode"]);

    expect(overlay.refused).toMatchObject([{ path: "triage/agents/triager.md", reason: expect.stringContaining("review_required") }]);
  });
});

describe("collectionOverlay with the keys a collection owns", () => {
  it("passes tags and cache_write_per_million on into the settings of an agent", () => {
    const text = "---\nimage: acme/agent:2\ntimeout_minutes: 10\ntags: [review, cheap]\nprices:\n  opus: { input_per_million: 1, output_per_million: 5, cache_read_per_million: 0.1, cache_write_per_million: 1.25 }\n---\nTriage.\n";
    const overlay = overlayOf({ "triage/agents/triager.md": text });

    expect(agentNamed(overlay, "triager")?.settings).toEqual({
      image: "acme/agent:2",
      timeout_minutes: 10,
      tags: ["review", "cheap"],
      prices: { opus: { input_per_million: 1, output_per_million: 5, cache_read_per_million: 0.1, cache_write_per_million: 1.25 } },
      prompt: "Triage.\n",
    });
  });

  it("refuses a pipeline file that carries an agent_definitions block, naming where an agent is defined", () => {
    const withBlock = `${pipelineYaml("triage", "triager")}agent_definitions:\n  triager:\n    settings:\n      model: opus\n`;
    const overlay = overlayOf({ "triage/pipeline.yaml": withBlock, "triage/agents/triager.md": TRIAGE_AGENT });

    expect(overlay.refused).toEqual([
      {
        path: "triage/pipeline.yaml",
        reason: "the file carries an agent_definitions block; in a collection an agent's settings live in <line>/agents/<agent>.md",
      },
    ]);
  });
});
