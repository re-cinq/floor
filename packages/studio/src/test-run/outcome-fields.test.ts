import { describe, expect, it } from "vitest";
import { outcomeFieldsOf } from "./outcome-fields.js";
import type { TestLine } from "./test-line.js";
import { reviewLoopLine } from "./test-run.fixtures.js";

const publishLine: TestLine = {
  id: "publish-line",
  body: {
    entry: "edit",
    exit: "done",
    args: {},
    nodes: [
      { id: "edit", station: "editor" },
      { id: "publish", station: "publisher", bind: { blurb: "summary" } },
      { id: "shelve", station: "archivist" },
      { id: "done" },
    ],
    edges: [
      { from: "edit", to: "publish", on: "publish" },
      { from: "edit", to: "shelve", on: "archive" },
      { from: "edit", to: "done", on: "hold" },
      { from: "publish", to: "done", on: "success" },
      { from: "shelve", to: "done", on: "success" },
    ],
  },
  stations: new Map([
    [
      "editor",
      {
        kind: "human",
        outcomes: ["publish", "hold", "archive", "discard"],
        needs: [],
        produces: [
          { name: "notes", kind: "value" },
          { name: "cover", kind: "file", path: "cover.png" },
          { name: "summary", kind: "value" },
        ],
      },
    ],
    [
      "publisher",
      {
        kind: "service",
        outcomes: ["success"],
        needs: [
          { name: "cover", kind: "file" },
          { name: "blurb", kind: "value", optional: true },
        ],
        produces: [],
      },
    ],
    [
      "archivist",
      {
        kind: "service",
        outcomes: ["success"],
        needs: [{ name: "notes", kind: "value", optional: true }],
        produces: [],
      },
    ],
  ]),
};

describe("outcomeFieldsOf", () => {
  it("asks for nothing when review reports approved, which routes to done", () => {
    expect(outcomeFieldsOf(reviewLoopLine, "review", "approved")).toEqual([]);
  });

  it("asks for review_feedback as a required value when review reports changes_requested, which routes to write and its fresh feedback need", () => {
    expect(outcomeFieldsOf(reviewLoopLine, "review", "changes_requested")).toEqual([
      { name: "review_feedback", kind: "value", required: true },
    ]);
  });

  it.each([
    {
      outcome: "publish",
      asks: "for cover (required) and summary (optional)",
      why: "cover by its own name, summary through the bind of blurb, notes unread",
      fields: [
        { name: "cover", kind: "file", required: true, path: "cover.png" },
        { name: "summary", kind: "value", required: false },
      ],
    },
    {
      outcome: "archive",
      asks: "for notes (optional)",
      why: "the archivist's need is optional",
      fields: [{ name: "notes", kind: "value", required: false }],
    },
    { outcome: "hold", asks: "for nothing", why: "it routes to a marker node", fields: [] },
    { outcome: "discard", asks: "for nothing", why: "no edge takes it", fields: [] },
  ])("asks $asks when edit reports $outcome: $why", ({ outcome, fields }) => {
    expect(outcomeFieldsOf(publishLine, "edit", outcome)).toEqual(fields);
  });
});
