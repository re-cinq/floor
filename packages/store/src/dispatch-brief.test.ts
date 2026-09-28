import { describe, expect, it } from "vitest";
import { setupStoreFixture } from "./assembly-run-store.fixtures.js";
import { DispatchBriefs, dispatchNeeds, type NeedSources } from "./dispatch-brief.js";
import type { StationBody } from "./types.js";

const { pool, store, definitions, openEntryVisit } = setupStoreFixture();

const BASE_URL = "http://floor.test";

const STATION: StationBody = {
  kind: "agent",
  agentDefinition: "reviewer",
  outcomes: ["success"],
  needs: [
    { name: "workspace", kind: "git", access: "write" },
    { name: "plan", kind: "file", path: "docs/plan.md" },
    { name: "notes", kind: "file", optional: true },
    { name: "pr_url", kind: "value" },
  ],
  produces: [],
};

function sources(overrides: Partial<NeedSources> = {}): NeedSources {
  return {
    station: STATION,
    bind: { workspace: "repo" },
    bag: {
      repo: { kind: "git", ref: "github.com/re-cinq/lore@feat/x", by: "start", sha: "9e1f" },
      plan: { kind: "file", ref: "sha256-abc", by: "v1" },
    },
    frozen: { workspace: "github.com/re-cinq/lore@feat/x@9e1f", plan: "/blobs/sha256-abc", pr_url: "https://pr/412", previous_error: "lint failed" },
    baseUrl: BASE_URL,
    ...overrides,
  };
}

function needNamed(name: string, from: NeedSources = sources()) {
  return dispatchNeeds(from).find((need) => need.name === name);
}

describe("dispatchNeeds", () => {
  it("places a git need at the sha the visit was promised, through the node's bind", () => {
    expect(needNamed("workspace")).toEqual({
      name: "workspace",
      kind: "git",
      path: "workspace",
      repoUrl: "https://github.com/re-cinq/lore",
      ref: "9e1f",
      access: "write",
    });
  });

  it("falls back to the branch for a git item with no sha, and to read access", () => {
    const station = { ...STATION, needs: [{ name: "repo", kind: "git" as const }] };
    const bag = { repo: { kind: "git" as const, ref: "github.com/re-cinq/lore@main", by: "start" } };

    expect(needNamed("repo", sources({ station, bag, bind: undefined }))).toMatchObject({ ref: "main", access: "read" });
  });

  it("places a file need at its declared path, fetched from the floor's blobs", () => {
    expect(needNamed("plan")).toEqual({ name: "plan", kind: "file", path: "docs/plan.md", url: "http://floor.test/blobs/sha256-abc" });
  });

  it("leaves out an optional need the bag does not hold", () => {
    expect(needNamed("notes")).toBeUndefined();
  });

  it("passes a value need as the visit froze it", () => {
    expect(needNamed("pr_url")).toEqual({ name: "pr_url", kind: "value", value: "https://pr/412" });
  });

  it("passes the built-in previous_error, which no station declares", () => {
    expect(needNamed("previous_error")).toEqual({ name: "previous_error", kind: "value", value: "lint failed" });
  });
});

function briefs(): DispatchBriefs {
  return new DispatchBriefs({ pool: pool(), runs: store(), definitions: definitions() });
}

describe("DispatchBriefs.briefFor", () => {
  it("returns the visit's needs, produces and resolved settings", async () => {
    const { visitId } = await openEntryVisit();

    const brief = await briefs().briefFor(visitId, BASE_URL);

    expect(brief).toMatchObject({
      settings: { image: "img:1", timeoutMinutes: 20 },
      needs: expect.arrayContaining([{ name: "workspace", kind: "git", path: "workspace", repoUrl: "https://github.com/re-cinq/lore", ref: "9e1f", access: "read" }]),
      produces: [{ name: "review_verdict", kind: "value" }, { name: "review_findings", kind: "file" }],
      conversation: { mode: "new" },
    });
  });

  it("returns null for a visit that does not exist", async () => {
    expect(await briefs().briefFor("0b0e7d3c-6f1a-4a52-9d3e-2f6f1c1e9a01", BASE_URL)).toBeNull();
  });

  it("returns null for a marker's visit, which nothing runs", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    const { visit } = await store().openVisit(runId, "retrospective", 1);

    expect(await briefs().briefFor(visit.id, BASE_URL)).toBeNull();
  });
});

describe("DispatchBriefs.visitSavedAs", () => {
  it("finds the visit whose report saved the conversation", async () => {
    const { visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "failed", sessionRef: "sha256-archive" });

    expect(await briefs().visitSavedAs("sha256-archive")).toBe(visitId);
  });

  it("finds nothing for an archive no visit saved", async () => {
    expect(await briefs().visitSavedAs("sha256-nothing")).toBeNull();
  });
});
