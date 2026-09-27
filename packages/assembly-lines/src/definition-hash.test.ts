import { describe, it, expect } from "vitest";
import { definitionHash } from "./definition-hash.js";

function line(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "implementation",
    description: "implement a spec",
    entry: "implement",
    exit: "done",
    nodes: [
      { id: "implement", station: "implementer" },
      { id: "done" },
    ],
    edges: [{ from: "implement", to: "done", on: "always" }],
    ...overrides,
  };
}

describe("definitionHash", () => {
  it("returns a 64-character lowercase hex digest", () => {
    expect(definitionHash(line())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the same digest for two structurally identical definitions", () => {
    expect(definitionHash(line())).toBe(definitionHash(line()));
  });

  it("ignores key ordering, so a reordered parse of the same definition hashes equal", () => {
    const reordered = {
      edges: [{ on: "always", to: "done", from: "implement" }],
      exit: "done",
      entry: "implement",
      nodes: [{ station: "implementer", id: "implement" }, { id: "done" }],
      description: "implement a spec",
      name: "implementation",
    };

    expect(definitionHash(reordered)).toBe(definitionHash(line()));
  });

  it("ignores explicitly-undefined optional fields, which a schema may or may not attach", () => {
    const withUndefined = {
      ...line(),
      nodes: [
        { id: "implement", station: "implementer", bind: undefined },
        { id: "done", start: undefined },
      ],
    };

    expect(definitionHash(withUndefined)).toBe(definitionHash(line()));
  });

  it("changes when a node changes", () => {
    const edited = line({
      nodes: [{ id: "implement", station: "implementer-v2" }, { id: "done" }],
    });

    expect(definitionHash(edited)).not.toBe(definitionHash(line()));
  });

  it("changes when an edge changes", () => {
    const edited = line({
      edges: [
        { from: "implement", to: "done", on: "success" },
        { from: "implement", to: "implement", on: "failed", iterationMax: 2 },
      ],
    });

    expect(definitionHash(edited)).not.toBe(definitionHash(line()));
  });

  it("changes when the entry node changes", () => {
    expect(definitionHash(line({ entry: "done" }))).not.toBe(definitionHash(line()));
  });

  it("changes when the exit node changes", () => {
    expect(definitionHash(line({ exit: "implement" }))).not.toBe(definitionHash(line()));
  });

  it("distinguishes a nested value from the string that spells it", () => {
    const stringified = line({
      nodes: [
        { id: "implement", station: '[{"id":"implement","station":"implementer"}]' },
        { id: "done" },
      ],
    });

    expect(definitionHash(stringified)).not.toBe(definitionHash(line()));
  });
});

describe("definitionHash ignores prose but not order", () => {
  it("ignores a reworded description, at the top level and on a node", () => {
    const reworded = line({
      description: "a completely different sentence",
      nodes: [
        { id: "implement", station: "implementer", description: "newly documented" },
        { id: "done", description: "also new" },
      ],
    });

    expect(definitionHash(reworded)).toBe(definitionHash(line()));
  });

  it("changes when edges are reordered, because the first candidate can win", () => {
    const forward = line({
      edges: [
        { from: "implement", to: "done", on: "always" },
        { from: "implement", to: "implement", on: "always" },
      ],
    });
    const reversed = line({
      edges: [
        { from: "implement", to: "implement", on: "always" },
        { from: "implement", to: "done", on: "always" },
      ],
    });

    expect(definitionHash(forward)).not.toBe(definitionHash(reversed));
  });
});
