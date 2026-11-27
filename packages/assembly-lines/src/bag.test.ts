import { describe, expect, it } from "vitest";
import type { Item, Report } from "@re-cinq/floor-contracts";
import { bagOf } from "./bag.js";

function visitOf(id: string, stationHash: string | null, produced?: Record<string, string>) {
  const report: Report = produced ? { outcome: "success", produced } : { outcome: "success" };

  return { id, stationHash, report };
}

describe("bagOf", () => {
  it("keeps the bag at start item topic 'tides' when visit-1 reported success and produced nothing", () => {
    const startItems: Record<string, Item> = { topic: { kind: "value", ref: "tides", by: "start" } };
    const visits = [visitOf("visit-1", "hash-1")];

    expect(bagOf(startItems, visits, () => undefined)).toEqual({
      topic: { kind: "value", ref: "tides", by: "start" },
    });
  });

  it("keeps produced name __proto__ as an own item 'x' and leaves the bag's prototype alone", () => {
    const produced = JSON.parse('{"__proto__":"x"}') as Record<string, string>;
    const visits = [visitOf("visit-1", "hash-1", produced)];

    const bag = bagOf({}, visits, () => undefined);

    expect({ own: Object.entries(bag), plainPrototype: Object.getPrototypeOf(bag) === Object.prototype }).toEqual({
      own: [["__proto__", { kind: "value", ref: "x", by: "visit-1" }]],
      plainPrototype: true,
    });
  });

  it("adds nothing when visit-1 produced draft 'draft.md' and has no station", () => {
    const visits = [visitOf("visit-1", null, { draft: "draft.md" })];

    expect(bagOf({}, visits, () => [{ name: "draft", kind: "file" }])).toEqual({});
  });

  it("keeps the bag at start item topic 'tides' while visit-1 is open and has not reported", () => {
    const startItems: Record<string, Item> = { topic: { kind: "value", ref: "tides", by: "start" } };
    const openVisit = { id: "visit-1", stationHash: "hash-1", report: null };

    expect(bagOf(startItems, [openVisit], () => [{ name: "draft", kind: "file" }])).toEqual({
      topic: { kind: "value", ref: "tides", by: "start" },
    });
  });

  it("gives draft the kind file that hash-1 declares and undeclared notes the kind value", () => {
    const visits = [visitOf("visit-1", "hash-1", { draft: "draft.md", notes: "keep it short" })];
    const producesOf = (stationHash: string) =>
      stationHash === "hash-1" ? [{ name: "draft", kind: "file" as const }] : undefined;

    expect(bagOf({}, visits, producesOf)).toEqual({
      draft: { kind: "file", ref: "draft.md", by: "visit-1" },
      notes: { kind: "value", ref: "keep it short", by: "visit-1" },
    });
  });

  it("gives draft the kind file when hash-1 declares draft as value and then as file", () => {
    const visits = [visitOf("visit-1", "hash-1", { draft: "draft.md" })];
    const producesOf = () => [
      { name: "draft", kind: "value" as const },
      { name: "draft", kind: "file" as const },
    ];

    expect(bagOf({}, visits, producesOf)).toEqual({
      draft: { kind: "file", ref: "draft.md", by: "visit-1" },
    });
  });

  it("holds draft 'draft-2.md' by visit-3 when the start gave seed.md and visit-1 produced draft-1.md before it", () => {
    const startItems: Record<string, Item> = { draft: { kind: "file", ref: "seed.md", by: "start" } };
    const visits = [
      visitOf("visit-1", "hash-1", { draft: "draft-1.md" }),
      visitOf("visit-3", "hash-1", { draft: "draft-2.md" }),
    ];

    expect(bagOf(startItems, visits, () => [{ name: "draft", kind: "file" }])).toEqual({
      draft: { kind: "file", ref: "draft-2.md", by: "visit-3" },
    });
  });
});
