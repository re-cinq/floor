import { describe, expect, it } from "vitest";
import { lintCommandGiven } from "./lint-command-given.js";

describe("lintCommandGiven", () => {
  it("carries --graph-against as graphAgainstDirectory", () => {
    const values = { "host-key": [], "graph-against": "base" };

    expect(lintCommandGiven(["lint", "head"], values)).toEqual({ directory: "head", hostKeys: [], shippedDirectory: undefined, graphAgainstDirectory: "base" });
  });
});
