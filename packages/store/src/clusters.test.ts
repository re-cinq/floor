import { beforeEach, describe, expect, it } from "vitest";
import { definitionHash } from "@floor/assembly-lines";
import { AGENT_DEFINITION_CHANGED, ClusterStore } from "./clusters.js";
import { DefinitionsStore } from "./definitions.js";
import { EventStore } from "./events.js";
import { setupTestPool } from "./pg-test-pool.js";

const pool = setupTestPool();
const reviewer = { settings: { model: "claude-sonnet-4-6", prompt: "Review the change." } };
const reviewerReworded = { settings: { model: "claude-sonnet-4-6", prompt: "Review the change, carefully." } };

beforeEach(async () => {
  await pool().query("truncate definitions, events, clusters cascade");
});

function clusters(now = new Date()): ClusterStore {
  return new ClusterStore({ pool: pool(), now: () => now });
}

async function changedEvents(): Promise<Array<{ tags: string[]; payload: unknown }>> {
  const { rows } = await pool().query(`select tags, payload from events where name = $1 order by id`, [AGENT_DEFINITION_CHANGED]);

  return rows;
}

describe("ClusterStore.putAgentDefinition", () => {
  it("writes one agent_definition.changed event per registered cluster, tagged with that cluster", async () => {
    await clusters().register("east", ["kind:agent"]);
    await clusters().register("west", ["kind:agent"]);
    const { hash } = await clusters().putAgentDefinition("reviewer", reviewer);

    expect(await changedEvents()).toEqual([
      { tags: ["cluster:east"], payload: { id: "reviewer", hash } },
      { tags: ["cluster:west"], payload: { id: "reviewer", hash } },
    ]);
  });

  it("writes no event when the same body is put again", async () => {
    await clusters().register("east", []);
    await clusters().putAgentDefinition("reviewer", reviewer);
    await pool().query("truncate events");
    await clusters().putAgentDefinition("reviewer", reviewer);

    expect(await changedEvents()).toEqual([]);
  });

  it("writes an event again when an older body is put back as the latest", async () => {
    await clusters().register("east", []);
    const first = await clusters().putAgentDefinition("reviewer", reviewer);
    await clusters().putAgentDefinition("reviewer", reviewerReworded);
    await pool().query("truncate events");
    await clusters().putAgentDefinition("reviewer", reviewer);

    expect(await changedEvents()).toEqual([{ tags: ["cluster:east"], payload: { id: "reviewer", hash: first.hash } }]);
  });
});

describe("ClusterStore.register", () => {
  it("queues the latest version of every agent definition the new cluster does not hold", async () => {
    const { hash } = await clusters().putAgentDefinition("reviewer", reviewer);
    await clusters().register("east", ["kind:agent"]);

    expect(await changedEvents()).toEqual([{ tags: ["cluster:east"], payload: { id: "reviewer", hash } }]);
  });

  it("queues nothing for a cluster that already holds the latest version", async () => {
    await clusters().register("east", []);
    await clusters().putAgentDefinition("reviewer", reviewer);
    await clusters().recordHolding("east", "reviewer", reviewer);
    await pool().query("truncate events");
    await clusters().register("east", []);

    expect(await changedEvents()).toEqual([]);
  });
});

describe("ClusterStore.recordHolding", () => {
  it("records the hash a cluster read back for the latest version, and adopts nothing", async () => {
    await clusters().register("east", []);
    const { hash } = await clusters().putAgentDefinition("reviewer", reviewer);
    const recorded = await clusters().recordHolding("east", "reviewer", reviewer);

    expect(recorded).toEqual({ hash, adopted: false });
  });

  it("adopts a body edited in kube as the newest version, created by the cluster, and sends it to the other clusters", async () => {
    await clusters().register("east", []);
    await clusters().register("west", []);
    await clusters().putAgentDefinition("reviewer", reviewer);
    await pool().query("truncate events");
    const recorded = await clusters().recordHolding("east", "reviewer", reviewerReworded);
    const latest = await new DefinitionsStore({ connection: pool() }).latest("agent_definition", "reviewer");

    expect(recorded).toEqual({ hash: definitionHash(reviewerReworded), adopted: true });
    expect(latest).toMatchObject({ hash: definitionHash(reviewerReworded), createdBy: "cluster:east" });
    expect((await changedEvents()).map((event) => event.tags)).toEqual([["cluster:east"], ["cluster:west"]]);
  });

  it("does not adopt an older version a lagging cluster still holds", async () => {
    await clusters().register("east", []);
    await clusters().putAgentDefinition("reviewer", reviewer);
    const second = await clusters().putAgentDefinition("reviewer", reviewerReworded);
    const recorded = await clusters().recordHolding("east", "reviewer", reviewer);
    const latest = await new DefinitionsStore({ connection: pool() }).latest("agent_definition", "reviewer");

    expect(recorded.adopted).toBe(false);
    expect(latest?.hash).toBe(second.hash);
  });
});

describe("ClusterStore.presence", () => {
  it("answers some for reviewer while west still holds the older version", async () => {
    await clusters().register("east", []);
    await clusters().register("west", []);
    await clusters().putAgentDefinition("reviewer", reviewer);
    await clusters().recordHolding("west", "reviewer", reviewer);
    const { hash } = await clusters().putAgentDefinition("reviewer", reviewerReworded);
    await clusters().recordHolding("east", "reviewer", reviewerReworded);

    expect(await clusters().presence()).toEqual({
      reviewer: {
        state: "some",
        latest: hash,
        clusters: [
          { id: "east", hash, current: true },
          { id: "west", hash: definitionHash(reviewer), current: false },
        ],
      },
    });
  });

  it("serves the body each cluster read back out of its kube", async () => {
    await clusters().register("east", []);
    await clusters().putAgentDefinition("reviewer", reviewer);
    await clusters().recordHolding("east", "reviewer", reviewer);

    expect(await clusters().holdings("reviewer")).toEqual([
      { clusterId: "east", hash: definitionHash(reviewer), body: reviewer, appliedAt: expect.any(Date) },
    ]);
  });
});

describe("events", () => {
  it("lets only the cluster a changed event names claim it", async () => {
    await clusters().register("east", []);
    await clusters().putAgentDefinition("reviewer", reviewer);
    const events = new EventStore({ connection: pool() });
    const byWest = await events.claim({ names: [AGENT_DEFINITION_CHANGED], tags: ["kind:agent", "cluster:west"], limit: 5, claimedBy: "west" });
    const byEast = await events.claim({ names: [AGENT_DEFINITION_CHANGED], tags: ["kind:agent", "cluster:east"], limit: 5, claimedBy: "east" });

    expect([byWest.length, byEast.length]).toEqual([0, 1]);
  });
});
