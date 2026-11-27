import { describe, expect, it } from "vitest";
import { previewedWorkNode, withAgentRunSetup, withClaudeMissing } from "./agent-run.fixtures.js";
import { startAgentRun } from "./agent-run.js";

const RESULT_LINE = { type: "result", result: "Done.\nLORE_NODE_RESULT: success", total_cost_usd: 0.0421, duration_ms: 8400 };

describe("startAgentRun", () => {
  it("resolves ended with outcome success, cost $0.0421 and 8400 ms when claude's result line states them for flow/work", async () => {
    await withAgentRunSetup(`#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(RESULT_LINE)}'\n`, async (setup) => {
      const { context, folder } = setup;
      const { ended } = await startAgentRun(context, await previewedWorkNode(setup), { node: "work", folder });

      expect(await ended).toMatchObject({ exitCode: 0, outcome: "success", costUsd: 0.0421, durationMs: 8400 });
    });
  });

  it("resolves ended with exit code null and 'could not start claude: spawn claude ENOENT' when claude is not on PATH", async () => {
    await withAgentRunSetup("", async (setup) => {
      const previewed = await previewedWorkNode(setup);

      await withClaudeMissing(setup.context, async (context) => {
        const { ended } = await startAgentRun(context, previewed, { node: "work", folder: setup.folder });

        expect(await ended).toEqual({ exitCode: null, error: "could not start claude: spawn claude ENOENT" });
      });
    });
  }, 5000);
});
