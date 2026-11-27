import { describe, expect, it } from "vitest";
import { costWording, outcomeWording } from "./test-visit-wording";

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
