import type { Item, NeedSpec } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import { needItemsOf, visitIdsSincePersonActed } from "./need-items.js";
import type { WalkGraph } from "./transition.js";

const freshVerdictNeed: NeedSpec = { name: "verdict", kind: "value", fresh: true };

const GRAPH: WalkGraph = {
  name: "plan",
  entry: "build",
  exit: "done",
  edges: [],
  nodes: [{ id: "build" }, { id: "author", kind: "human" }, { id: "check" }],
};

function visitOf(id: string, nodeId: string, requestedBy: string | null = null) {
  return { id, nodeId, requestedBy };
}

function verdictBy(by: string): Item {
  return { kind: "value", ref: "approved", by };
}

describe("needItemsOf", () => {
  it("names plan as missing when the bag is empty", () => {
    expect(needItemsOf([{ name: "plan", kind: "file" }], undefined, {})).toEqual({
      items: {},
      missing: ["plan"],
    });
  });

  it("names constructor as missing when the bag is empty", () => {
    expect(needItemsOf([{ name: "constructor", kind: "value" }], undefined, {})).toEqual({
      items: {},
      missing: ["constructor"],
    });
  });

  it("gives feedback the review_feedback item 'tighten the intro' when feedback is bound to review_feedback", () => {
    const reviewItem = { kind: "value", ref: "tighten the intro", by: "visit-2" } as const;

    expect(
      needItemsOf([{ name: "feedback", kind: "value" }], { feedback: "review_feedback" }, { review_feedback: reviewItem }),
    ).toEqual({ items: { feedback: reviewItem }, missing: [] });
  });

  it("gives toString its own bag item 'v1' when bind is {} and binds nothing", () => {
    const toStringItem: Item = { kind: "value", ref: "v1", by: "visit-1" };
    const bag: Record<string, Item> = { toString: toStringItem };

    expect(needItemsOf([{ name: "toString", kind: "value" }], {}, bag)).toEqual({
      items: { toString: toStringItem },
      missing: [],
    });
  });

  it("supplies a need named __proto__ as an own item 'x' and leaves the items' prototype alone", () => {
    const bag = JSON.parse('{"__proto__":{"kind":"value","ref":"x","by":"visit-1"}}') as Record<string, Item>;
    const specs: NeedSpec[] = [{ name: "__proto__", kind: "value" }];

    const { items: supplied, missing } = needItemsOf(specs, undefined, bag);

    expect({
      own: Object.entries(supplied),
      plainPrototype: Object.getPrototypeOf(supplied) === Object.prototype,
      missing,
    }).toEqual({
      own: [["__proto__", { kind: "value", ref: "x", by: "visit-1" }]],
      plainPrototype: true,
      missing: [],
    });
  });

  it("leaves optional feedback out of items and missing when the bag is empty", () => {
    expect(needItemsOf([{ name: "feedback", kind: "value", optional: true }], undefined, {})).toEqual({
      items: {},
      missing: [],
    });
  });

  it("names fresh verdict as not produced since a person last acted when visit-1 made it and the person acted at visit-2", () => {
    const bag = { verdict: verdictBy("visit-1") };

    expect(needItemsOf([freshVerdictNeed], undefined, bag, new Set(["visit-2"]))).toEqual({
      items: {},
      missing: ["verdict (not produced since a person last acted)"],
    });
  });

  it("leaves optional fresh verdict out of items and missing when visit-1 made it and the person acted at visit-2", () => {
    const bag = { verdict: verdictBy("visit-1") };

    expect(needItemsOf([{ ...freshVerdictNeed, optional: true }], undefined, bag, new Set(["visit-2"]))).toEqual({
      items: {},
      missing: [],
    });
  });

  it("gives fresh verdict its bag item when visit-2 made it and the person acted at visit-2", () => {
    const bag = { verdict: verdictBy("visit-2") };

    expect(needItemsOf([freshVerdictNeed], undefined, bag, new Set(["visit-2"]))).toEqual({
      items: { verdict: bag.verdict },
      missing: [],
    });
  });

  it("gives fresh verdict its bag item when pr.opened made it and nobody has acted", () => {
    const bag = { verdict: verdictBy("pr.opened") };

    expect(needItemsOf([freshVerdictNeed], undefined, bag)).toEqual({
      items: { verdict: bag.verdict },
      missing: [],
    });
  });

  it("gives verdict without fresh its bag item when visit-1 made it and the person acted at visit-2", () => {
    const bag = { verdict: verdictBy("visit-1") };

    expect(needItemsOf([{ name: "verdict", kind: "value" }], undefined, bag, new Set(["visit-2"]))).toEqual({
      items: { verdict: bag.verdict },
      missing: [],
    });
  });
});

describe("visitIdsSincePersonActed", () => {
  it("returns undefined when no visit is a human node's and none was started by hand", () => {
    const visits = [visitOf("visit-1", "build"), visitOf("visit-2", "check")];

    expect(visitIdsSincePersonActed(GRAPH, visits)).toBeUndefined();
  });

  it("returns the human node's visit and those after it when a human visit is the second of three", () => {
    const visits = [visitOf("visit-1", "build"), visitOf("visit-2", "author"), visitOf("visit-3", "check")];

    expect(visitIdsSincePersonActed(GRAPH, visits)).toEqual(new Set(["visit-2", "visit-3"]));
  });

  it("returns the hand-started visit and those after it when it comes after the human visit", () => {
    const visits = [visitOf("visit-1", "author"), visitOf("visit-2", "build"), visitOf("visit-3", "check", "ana"), visitOf("visit-4", "build")];

    expect(visitIdsSincePersonActed(GRAPH, visits)).toEqual(new Set(["visit-3", "visit-4"]));
  });
});
