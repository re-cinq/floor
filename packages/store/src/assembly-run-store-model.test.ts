import { beforeEach, describe, expect, it } from "vitest";
import type { ModelCatalogStatus } from "@re-cinq/floor-contracts";
import { ClusterStore } from "./clusters.js";
import { FIXED_NOW, REVIEWER_AGENT_DEFINITION, setupStoreFixture } from "./assembly-run-store.fixtures.js";

const { pool, store, events, openEntryVisit } = setupStoreFixture();

const HAIKU_ONLY_CATALOG: ModelCatalogStatus = {
  refreshedAt: "2026-11-28T09:00:00Z",
  vendors: [{ vendor: "claude", provider: "anthropic", secretRefs: [], error: "", models: [{ id: "claude-haiku-4-5", displayName: "Haiku" }] }],
};

beforeEach(async () => {
  await pool().query("truncate clusters cascade");
});

describe("AssemblyRunStore.openVisit with a model no cluster can run", () => {
  it("fails a visit of an agent on claude-sonnet-5-5 at once when the only cluster's catalog lists claude-haiku-4-5, and dispatches nothing", async () => {
    await new ClusterStore({ pool: pool(), now: () => FIXED_NOW }).register("east", ["kind:agent"], { models: HAIKU_ONLY_CATALOG });

    const { runId, visitId } = await openEntryVisit(undefined, { settings: { ...REVIEWER_AGENT_DEFINITION.settings, model: "claude-sonnet-5-5" } });
    const dispatches = (await events().listByRun(runId)).filter((event) => event.name === "station_run.dispatch");

    expect({ visit: await store().visit(visitId), dispatches }).toMatchObject({
      visit: { report: { outcome: "failed", error: "agent reviewer names model claude-sonnet-5-5, which no cluster can run (catalog refreshed 2026-11-28T09:00:00Z)" } },
      dispatches: [],
    });
  });
});
