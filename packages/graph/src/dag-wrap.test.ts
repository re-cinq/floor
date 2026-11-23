import { describe, it, expect } from "vitest";
import { wrapLayer } from "./dag-wrap";

describe("wrapLayer", () => {
  it("puts layers 0..6 at 3 columns into bands 0,0,0,1,1,1,2", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((layer) => wrapLayer(layer, 3))).toEqual([
      { band: 0, column: 0 },
      { band: 0, column: 1 },
      { band: 0, column: 2 },
      { band: 1, column: 0 },
      { band: 1, column: 1 },
      { band: 1, column: 2 },
      { band: 2, column: 0 },
    ]);
  });

  it("keeps every layer in band 0 when the columns are unbounded", () => {
    expect(wrapLayer(40, Number.POSITIVE_INFINITY)).toEqual({
      band: 0,
      column: 40,
    });
  });
});

