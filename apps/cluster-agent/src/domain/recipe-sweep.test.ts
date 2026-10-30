import { describe, expect, it } from "vitest";
import { abandonedAgents, unusedRecipes, type Listed } from "./recipe-sweep.js";

const NOW = new Date("2026-10-30T12:00:00Z");
const OLD = "2026-10-30T10:00:00Z";
const RECIPE = { "floor.re-cinq.com/recipe": "true" };

function station(name: string, agentDefRef: string, labels: Record<string, string> | null = RECIPE, createdAt = OLD): Listed {
  return { name, createdAt, labels: labels ?? undefined, ref: agentDefRef };
}

function definition(name: string, labels: Record<string, string> | null = RECIPE, createdAt = OLD): Listed {
  return { name, createdAt, labels: labels ?? undefined };
}

describe("unusedRecipes", () => {
  it("removes recipe floor-bbbbbbbbbbbb, which no Agent runs, and keeps floor-aaaaaaaaaaaa, which floor-v2 runs", () => {
    expect(
      unusedRecipes({
        agentStationRefs: ["floor-aaaaaaaaaaaa"],
        stations: [station("floor-aaaaaaaaaaaa", "floor-aaaaaaaaaaaa"), station("floor-bbbbbbbbbbbb", "floor-bbbbbbbbbbbb")],
        definitions: [definition("floor-aaaaaaaaaaaa"), definition("floor-bbbbbbbbbbbb")],
        now: NOW,
      }),
    ).toEqual({ stations: ["floor-bbbbbbbbbbbb"], definitions: ["floor-bbbbbbbbbbbb"] });
  });

  it("keeps a recipe made 2 minutes ago, before its first visit's Agent exists", () => {
    expect(
      unusedRecipes({
        agentStationRefs: [],
        stations: [station("floor-cccccccccccc", "floor-cccccccccccc", RECIPE, "2026-10-30T11:58:00Z")],
        definitions: [definition("floor-cccccccccccc", RECIPE, "2026-10-30T11:58:00Z")],
        now: NOW,
      }),
    ).toEqual({ stations: [], definitions: [] });
  });

  it("removes the unlabelled per-visit triple floor-<uuid> of an earlier release once its Agent is gone", () => {
    const legacy = "floor-0b0e7a32-5c55-4e2e-9a64-0f4e6f1d2c3b";

    expect(
      unusedRecipes({ agentStationRefs: [], stations: [station(legacy, legacy, null)], definitions: [definition(legacy, null)], now: NOW }),
    ).toEqual({ stations: [legacy], definitions: [legacy] });
  });

  it("keeps the per-visit triple of an earlier release while its visit's Agent still runs", () => {
    const legacy = "floor-0b0e7a32-5c55-4e2e-9a64-0f4e6f1d2c3b";

    expect(
      unusedRecipes({ agentStationRefs: [legacy], stations: [station(legacy, legacy, null)], definitions: [definition(legacy, null)], now: NOW }),
    ).toEqual({ stations: [], definitions: [] });
  });

  it("never removes a Station or AgentDefinition named reviewer that someone else made", () => {
    expect(
      unusedRecipes({ agentStationRefs: [], stations: [station("reviewer", "reviewer", null)], definitions: [definition("reviewer", null)], now: NOW }),
    ).toEqual({ stations: [], definitions: [] });
  });
});

describe("abandonedAgents", () => {
  const visit = "floor-0b0e7a32-5c55-4e2e-9a64-0f4e6f1d2c3b";

  it("picks a Succeeded visit Agent made 2026-10-02, whose abort was lost", () => {
    expect(abandonedAgents([{ name: visit, phase: "Succeeded", createdAt: "2026-10-02T11:07:05Z" }], NOW)).toEqual([visit]);
  });

  it("picks a Failed visit Agent older than a day", () => {
    expect(abandonedAgents([{ name: visit, phase: "Failed", createdAt: "2026-10-29T11:00:00Z" }], NOW)).toEqual([visit]);
  });

  it("keeps a Succeeded visit Agent made an hour ago, its abort still to come", () => {
    expect(abandonedAgents([{ name: visit, phase: "Succeeded", createdAt: "2026-10-30T11:00:00Z" }], NOW)).toEqual([]);
  });

  it("keeps a Running visit Agent made 2026-10-02", () => {
    expect(abandonedAgents([{ name: visit, phase: "Running", createdAt: "2026-10-02T11:07:05Z" }], NOW)).toEqual([]);
  });

  it("keeps a Succeeded Agent named reviewer-run-1 that the floor did not make", () => {
    expect(abandonedAgents([{ name: "reviewer-run-1", phase: "Succeeded", createdAt: "2026-10-02T11:07:05Z" }], NOW)).toEqual([]);
  });
});
