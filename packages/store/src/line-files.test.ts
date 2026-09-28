import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PgPool } from "./pg.js";
import { openTestPool } from "./test-database.js";
import { AssemblyRunStore } from "./assembly-run-store.js";
import { BlobsStore } from "./blobs.js";
import { DefinitionsStore } from "./definitions.js";
import { OutsideEvents } from "./outside-events.js";
import type { LineBody, Run, StationBody } from "./types.js";

const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

let pool: PgPool;

beforeAll(async () => {
  pool = await openTestPool();
});

beforeEach(async () => {
  await pool.query("truncate definitions, assembly_runs, station_runs, events, blobs restart identity cascade");
});

afterAll(async () => {
  await pool.end();
});

function store(): AssemblyRunStore {
  return new AssemblyRunStore({ pool, now: () => FIXED_NOW });
}

function definitions(): DefinitionsStore {
  return new DefinitionsStore({ connection: pool });
}

function blobs(): BlobsStore {
  return new BlobsStore({ connection: pool });
}

function outside(): OutsideEvents {
  return new OutsideEvents({ pool, runs: store(), definitions: definitions() });
}

const REVIEWER_STATION: StationBody = { kind: "human", outcomes: ["success"], needs: [{ name: "plan", kind: "file" }], produces: [] };

function lineWithFile(hash: string, start?: LineBody["start"]): LineBody {
  return {
    entry: "review",
    exit: "done",
    start,
    args: {},
    files: { plan: hash },
    nodes: [{ id: "review", station: "reviewer" }, { id: "done" }],
    edges: [{ from: "review", to: "done", on: "success" }],
  };
}

async function seedLineWithFile(hash: string): Promise<void> {
  await definitions().put("line", "with-file", lineWithFile(hash));
  await definitions().put("station", "reviewer", REVIEWER_STATION);
}

async function startedRunWithFile(): Promise<{ hash: string; run: Run }> {
  const { hash } = await blobs().put(Buffer.from("plan text"));

  await seedLineWithFile(hash);
  const { run } = await store().start({ lineId: "with-file", repo: "r", startItems: {} });

  return { hash, run };
}

describe("AssemblyRunStore.start: a line's files", () => {
  it("seeds a line's file into the bag as a file item by \"line\"", async () => {
    const { hash, run } = await startedRunWithFile();

    const bag = await store().bag(run.id);

    expect(bag.plan).toEqual({ kind: "file", ref: hash, by: "line" });
  });

  it("lets the caller's start item of the same name win over the line's file", async () => {
    const { hash } = await blobs().put(Buffer.from("plan text"));
    await seedLineWithFile(hash);

    const { run } = await store().start({ lineId: "with-file", repo: "r", startItems: { plan: { kind: "value", ref: "override", by: "start" } } });
    const bag = await store().bag(run.id);

    expect(bag.plan).toEqual({ kind: "value", ref: "override", by: "start" });
  });

  it("refuses a start naming a file hash the blobs table does not hold", async () => {
    await seedLineWithFile("sha256-missing");

    await expect(store().start({ lineId: "with-file", repo: "r", startItems: {} })).rejects.toThrow(/file "plan" names blob "sha256-missing"/);
  });

  it("opens a station's brief with /blobs/<hash> for a need matching the file's name", async () => {
    const { hash, run } = await startedRunWithFile();

    const { visit } = await store().openVisit(run.id, "review", 1);
    const needs = visit.brief.needs;

    expect(needs.plan).toBe(`/blobs/${hash}`);
  });
});

describe("OutsideEvents.startLines: a line's files", () => {
  it("seeds a line's file into the bag of a run started by an event", async () => {
    const { hash } = await blobs().put(Buffer.from("plan text"));
    await definitions().put("line", "event-line", lineWithFile(hash, { on: ["e"], args: {} }));
    await definitions().put("station", "reviewer", REVIEWER_STATION);

    const [started] = await outside().startLines({ name: "e", payload: { repo: "github.com/re-cinq/lore" } });
    const bag = await store().bag(started!.run.id);

    expect(bag.plan).toEqual({ kind: "file", ref: hash, by: "line" });
  });
});
