import { beforeEach, describe, expect, it } from "vitest";
import { DefinitionsStore } from "./definitions.js";
import { setupTestPool } from "./pg-test-pool.js";

const pool = setupTestPool();

beforeEach(async () => {
  await pool().query("truncate definitions");
});

function store(): DefinitionsStore {
  return new DefinitionsStore({ connection: pool() });
}

describe("DefinitionsStore.put", () => {
  it("returns created:true for a new body", async () => {
    const result = await store().put("station", "review", { kind: "agent" });

    expect(result.created).toBe(true);
  });

  it("returns the same hash for the same body put twice", async () => {
    const first = await store().put("station", "review", { kind: "agent" });
    const second = await store().put("station", "review", { kind: "agent" });

    expect(second.hash).toBe(first.hash);
  });

  it("returns created:false the second time an identical body is put", async () => {
    await store().put("station", "review", { kind: "agent" });
    const second = await store().put("station", "review", { kind: "agent" });

    expect(second.created).toBe(false);
  });

  it("makes a body the id held before a newer one the latest again, and reports it created", async () => {
    await store().put("station", "review", { kind: "agent" });
    await store().put("station", "review", { kind: "service" });
    const back = await store().put("station", "review", { kind: "agent" });
    const latest = await store().latest<{ kind: string }>("station", "review");

    expect({ created: back.created, latest: latest?.body.kind }).toEqual({ created: true, latest: "agent" });
  });

  it("keeps the hash of a version brought to the front again", async () => {
    const first = await store().put("station", "review", { kind: "agent" });
    await store().put("station", "review", { kind: "service" });
    const back = await store().put("station", "review", { kind: "agent" });

    expect(back.hash).toBe(first.hash);
  });

  it("returns a different hash for a changed body", async () => {
    const first = await store().put("station", "review", { kind: "agent" });
    const second = await store().put("station", "review", { kind: "service" });

    expect(second.hash).not.toBe(first.hash);
  });

  it("stores the description Reviews the PR on a body that differs only in it, keeping its hash and reporting it not created", async () => {
    const first = await store().put("station", "review", { kind: "agent" });
    const reworded = await store().put("station", "review", { kind: "agent", description: "Reviews the PR" });
    const latest = await store().latest<{ description?: string }>("station", "review");

    expect({ hash: reworded.hash, created: reworded.created, description: latest?.body.description }).toEqual({
      hash: first.hash,
      created: false,
      description: "Reviews the PR",
    });
  });

  it("keeps kinds separate, so a line and a station may share an id", async () => {
    const line = await store().put("line", "review", { entry: "a" });
    const station = await store().put("station", "review", { kind: "agent" });

    expect(line.hash).not.toBe(station.hash);
  });
});

describe("DefinitionsStore.latest", () => {
  it("returns null for an id that was never put", async () => {
    expect(await store().latest("station", "missing")).toBeNull();
  });

  it("returns the most recently put version", async () => {
    await store().put("station", "review", { kind: "agent" });
    await store().put("station", "review", { kind: "service" });

    const latest = await store().latest<{ kind: string }>("station", "review");

    expect(latest?.body.kind).toBe("service");
  });

  it("never returns an archived version", async () => {
    await store().put("station", "review", { kind: "agent" });
    await store().archive("station", "review");

    expect(await store().latest("station", "review")).toBeNull();
  });
});

describe("DefinitionsStore.byHash", () => {
  it("returns the exact version named, even after a newer one exists", async () => {
    const first = await store().put("station", "review", { kind: "agent" });

    await store().put("station", "review", { kind: "service" });

    const pinned = await store().byHash<{ kind: string }>("station", "review", first.hash);

    expect(pinned?.body.kind).toBe("agent");
  });

  it("returns null for a hash that was never put", async () => {
    expect(await store().byHash("station", "review", "sha256-nonexistent")).toBeNull();
  });
});

describe("DefinitionsStore.byHashOnly", () => {
  it("finds the version by hash alone, with no id given", async () => {
    const put = await store().put("station", "review", { kind: "agent" });

    const found = await store().byHashOnly<{ kind: string }>("station", put.hash);

    expect(found?.body.kind).toBe("agent");
  });

  it("returns null for a hash that was never put", async () => {
    expect(await store().byHashOnly("station", "sha256-nonexistent")).toBeNull();
  });
});

describe("DefinitionsStore.listLatest", () => {
  it("returns the latest version of every id, one row each", async () => {
    await store().put("station", "review", { kind: "agent" });
    await store().put("station", "review", { kind: "service" });
    await store().put("station", "triage", { kind: "human" });

    const latest = await store().listLatest<{ kind: string }>("station");

    expect(latest.map((row) => ({ id: row.id, kind: row.body.kind }))).toEqual(
      expect.arrayContaining([{ id: "review", kind: "service" }, { id: "triage", kind: "human" }]),
    );
  });

  it("narrows to one id when given", async () => {
    await store().put("station", "review", { kind: "agent" });
    await store().put("station", "triage", { kind: "human" });

    const latest = await store().listLatest<{ kind: string }>("station", "review");

    expect(latest.map((row) => row.id)).toEqual(["review"]);
  });

  it("excludes an archived id", async () => {
    await store().put("station", "review", { kind: "agent" });
    await store().archive("station", "review");

    expect(await store().listLatest("station")).toEqual([]);
  });
});

describe("DefinitionsStore.versions", () => {
  it("returns every version, newest first", async () => {
    await store().put("station", "review", { kind: "agent" });
    await store().put("station", "review", { kind: "service" });

    const versions = await store().versions<{ kind: string }>("station", "review");

    expect(versions.map((version) => version.body.kind)).toEqual(["service", "agent"]);
  });
});

describe("DefinitionsStore.archive", () => {
  it("leaves an archived version reachable by its exact hash", async () => {
    const put = await store().put("station", "review", { kind: "agent" });

    await store().archive("station", "review");

    expect(await store().byHash("station", "review", put.hash)).not.toBeNull();
  });
});
