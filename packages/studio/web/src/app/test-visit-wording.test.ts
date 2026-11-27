import { describe, expect, it } from "vitest";
import { costWording, outcomeWording, totalOf } from "./test-visit-wording";

describe("outcomeWording", () => {
  it.each([
    { name: "returns running when agent visit without report", visit: { kind: "agent", report: null }, expected: "running" },
    { name: "returns waiting when stand-in visit without report", visit: { kind: "stand-in", report: null }, expected: "waiting" },
    { name: "returns approved when stand-in visit reported approved", visit: { kind: "stand-in", report: { outcome: "approved" } }, expected: "approved" },
  ])("$name", ({ visit, expected }) => {
    expect(outcomeWording(visit)).toBe(expected);
  });
});

describe("costWording", () => {
  it("returns not stated when no cost", () => {
    expect(costWording(undefined)).toBe("not stated");
  });

  it("returns the dollar amount when cost 0.02", () => {
    expect(costWording(0.02)).toBe("$0.02");
  });
});

describe("totalOf", () => {
  it.each([
    { name: "returns cost 0.3 and duration 3000 when visits cost 0.1 and 0.2 and last 1000 and 2000 ms", visits: [{ costUsd: 0.1, agentDurationMs: 1000 }, { costUsd: 0.2, agentDurationMs: 2000 }], total: { costUsd: 0.3, agentDurationMs: 3000 } },
    { name: "returns no cost and no duration when no visit states one", visits: [{}, {}], total: { costUsd: undefined, agentDurationMs: undefined } },
  ])("$name", ({ visits, total }) => {
    expect(totalOf(visits)).toStrictEqual(total);
  });
});
