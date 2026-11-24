import { describe, expect, it } from "vitest";
import { markerLine } from "./line.fixtures";
import { isPassThrough } from "./pass-through";

describe("isPassThrough", () => {
  it("returns true for push when one edge leads in and a single always edge leads out", () => {
    const definition = markerLine({
      entry: "write",
      nodeIds: ["write", "push", "done"],
      edges: [
        ["write", "push", "success"],
        ["push", "done", "always"],
      ],
    });

    expect(isPassThrough(definition, "push")).toBe(true);
  });

  it("returns false for push when its single outgoing edge is on success", () => {
    const definition = markerLine({
      entry: "write",
      nodeIds: ["write", "push", "done"],
      edges: [
        ["write", "push", "success"],
        ["push", "done", "success"],
      ],
    });

    expect(isPassThrough(definition, "push")).toBe(false);
  });

  it("returns false for push when two edges lead in, even with a single always edge out", () => {
    const definition = markerLine({
      entry: "write",
      nodeIds: ["write", "review", "push", "done"],
      edges: [
        ["write", "push", "success"],
        ["write", "review", "changes_requested"],
        ["review", "push", "success"],
        ["push", "done", "always"],
      ],
    });

    expect(isPassThrough(definition, "push")).toBe(false);
  });

  it("returns false for validate when it is started from outside the line, even with one edge in and a single always edge out", () => {
    const definition = markerLine({
      entry: "write",
      nodeIds: ["write", "validate", "done"],
      outsideStarts: { validate: "manual.plan.validate" },
      edges: [
        ["write", "validate", "success"],
        ["validate", "done", "always"],
      ],
    });

    expect(isPassThrough(definition, "validate")).toBe(false);
  });

  it("returns false for start when it is the entry, even with one edge looping back in and a single always edge out", () => {
    const definition = markerLine({
      entry: "start",
      nodeIds: ["start", "check", "done"],
      edges: [
        ["start", "check", "always"],
        ["check", "start", "changes_requested"],
        ["check", "done", "success"],
      ],
    });

    expect(isPassThrough(definition, "start")).toBe(false);
  });

  it("returns false for ghost when the definition does not declare it, even with one edge in and a single always edge out", () => {
    const definition = markerLine({
      entry: "a",
      nodeIds: ["a", "done"],
      edges: [
        ["a", "ghost", "success"],
        ["ghost", "done", "always"],
      ],
    });

    expect(isPassThrough(definition, "ghost")).toBe(false);
  });
});
