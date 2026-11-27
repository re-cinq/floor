import { describe, expect, it } from "vitest";
import { edgeTaken } from "./run-edge.js";
import { workLine } from "./station-fixtures.js";

describe("edgeTaken", () => {
  it("returns the work to fail edge for outcome failed from work", () => {
    expect(edgeTaken({ line: workLine, node: "work", outcome: "failed" })).toMatchObject({ from: "work", to: "fail", on: "failed" });
  });
});
