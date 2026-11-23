import { describe, it, expect } from "vitest";
import { columnsToFit } from "./wrap-to-fit";

const uniformLayout = (layers: number, columnWidth: number, bandHeight: number) => (columns: number) => ({
  width: columns * columnWidth,
  height: Math.ceil(layers / columns) * bandHeight,
});

describe("columnsToFit", () => {
  it("wraps 12 layers at 3 columns in a 720 x 800 box, where the drawing fits at scale 1", () => {
    expect(columnsToFit(12, { width: 720, height: 800 }, uniformLayout(12, 240, 200))).toBe(3);
  });

  it("keeps 4 layers on one row of 4 columns in a 1000 x 1000 box, where every count fits at scale 1", () => {
    expect(columnsToFit(4, { width: 1000, height: 1000 }, uniformLayout(4, 100, 100))).toBe(4);
  });

  it("gives 1 column for a line of 0 layers", () => {
    expect(columnsToFit(0, { width: 1000, height: 1000 }, uniformLayout(0, 100, 100))).toBe(1);
  });
});
