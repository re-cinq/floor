import type { LineArgSpec } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import { startItemsOf } from "./start-items.js";
import type { TestLine } from "./test-line.js";

const researchLine: TestLine = {
  id: "research-line",
  body: {
    entry: "done",
    exit: "done",
    args: { topic: { kind: "value", subject: true }, repo: { kind: "git" } },
    nodes: [{ id: "done" }],
    edges: [],
  },
  stations: new Map(),
};

const bothStartItems = {
  items: {
    topic: { kind: "value", ref: "tides", by: "start" },
    repo: { kind: "git", ref: "/home/dev/checkouts/notes", by: "start" },
  },
  missing: [],
};

describe("startItemsOf", () => {
  it("names repo as missing and hands out no items when only topic 'tides' is entered", () => {
    expect(startItemsOf(researchLine, { topic: "tides" })).toEqual({ items: {}, missing: ["repo"] });
  });

  it("names constructor as missing when the line declares it and nothing is entered", () => {
    const constructorLine: TestLine = {
      ...researchLine,
      body: { ...researchLine.body, args: Object.fromEntries([["constructor", { kind: "value" }]]) },
    };

    expect(startItemsOf(constructorLine, {})).toEqual({ items: {}, missing: ["constructor"] });
  });

  it("makes an argument named __proto__ an own value item 'x' and leaves the items' prototype alone", () => {
    const protoArgs = JSON.parse('{"__proto__":{"kind":"value"}}') as Record<string, LineArgSpec>;
    const protoLine: TestLine = { ...researchLine, body: { ...researchLine.body, args: protoArgs } };
    const entered = JSON.parse('{"__proto__":"x"}') as Record<string, string>;

    const { items: startItems, missing } = startItemsOf(protoLine, entered);

    expect({
      own: Object.entries(startItems),
      plainPrototype: Object.getPrototypeOf(startItems) === Object.prototype,
      missing,
    }).toEqual({
      own: [["__proto__", { kind: "value", ref: "x", by: "start" }]],
      plainPrototype: true,
      missing: [],
    });
  });

  it("makes topic a value item 'tides' and repo a git item '/home/dev/checkouts/notes', both by start", () => {
    expect(startItemsOf(researchLine, { topic: "tides", repo: "/home/dev/checkouts/notes" })).toEqual(bothStartItems);
  });

  it("drops entry secret 'injected', which research-line does not declare", () => {
    expect(
      startItemsOf(researchLine, { topic: "tides", repo: "/home/dev/checkouts/notes", secret: "injected" }),
    ).toEqual(bothStartItems);
  });

  it.each(["", "   "])("names repo as missing when it is entered as %j", (blank) => {
    expect(startItemsOf(researchLine, { topic: "tides", repo: blank })).toEqual({ items: {}, missing: ["repo"] });
  });

  describe("with line file style_guide", () => {
    const styleGuideLine: TestLine = {
      ...researchLine,
      body: { ...researchLine.body, files: { style_guide: "sha256:9f2c" } },
    };

    it("names line file style_guide as missing and hands out no items when only the two arguments are entered", () => {
      expect(startItemsOf(styleGuideLine, { topic: "tides", repo: "/home/dev/checkouts/notes" })).toEqual({
        items: {},
        missing: ["style_guide"],
      });
    });

    it("makes line file style_guide a file item '/home/dev/docs/style.md' by start beside the two arguments", () => {
      expect(
        startItemsOf(styleGuideLine, {
          topic: "tides",
          repo: "/home/dev/checkouts/notes",
          style_guide: "/home/dev/docs/style.md",
        }),
      ).toEqual({
        items: {
          topic: { kind: "value", ref: "tides", by: "start" },
          repo: { kind: "git", ref: "/home/dev/checkouts/notes", by: "start" },
          style_guide: { kind: "file", ref: "/home/dev/docs/style.md", by: "start" },
        },
        missing: [],
      });
    });
  });
});
