import { describe, it, expect } from "vitest";
import { IDENTITY, fitTransform, keepInView, panBy, revealArea, zoomAt } from "./viewport";

describe("fitTransform", () => {
  it("scales a 2000 x 1000 drawing to 0.5 and centers it vertically in a 1000 x 1000 box", () => {
    expect(
      fitTransform({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }),
    ).toEqual({ scale: 0.5, x: 0, y: 250 });
  });

  it("keeps a 400 x 200 drawing at scale 1 and centers it in a 1000 x 1000 box", () => {
    expect(
      fitTransform({ width: 400, height: 200 }, { width: 1000, height: 1000 }),
    ).toEqual({ scale: 1, x: 300, y: 400 });
  });

  it.each([
    { width: 0, height: 0 },
    { width: 1000, height: 0 },
  ])("returns the identity for a 2000 x 1000 drawing in an unmeasured $width x $height box", (box) => {
    expect(fitTransform({ width: 2000, height: 1000 }, box)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("zoomAt", () => {
  const anchor = { x: 100, y: 50 };

  it("doubles the scale and keeps the box point 100, 50 in place when zooming the identity by 2", () => {
    expect(zoomAt(IDENTITY, anchor, 2)).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("stops at scale 2 and keeps the box point 100, 50 in place when zooming the identity by 4", () => {
    expect(zoomAt(IDENTITY, anchor, 4)).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("stops at scale 0.1 and keeps the box point 100, 50 in place when zooming the identity by 0.01", () => {
    expect(zoomAt(IDENTITY, anchor, 0.01)).toEqual({ scale: 0.1, x: 90, y: 45 });
  });
});

describe("panBy", () => {
  it("moves a transform at 10, 20 to 40, -30 for a drag of 30, -50 and keeps scale 2", () => {
    expect(panBy({ scale: 2, x: 10, y: 20 }, { x: 30, y: -50 })).toEqual({ scale: 2, x: 40, y: -30 });
  });
});

describe("keepInView", () => {
  const drawing = { width: 400, height: 200 };
  const box = { width: 1000, height: 1000 };

  const resting = { scale: 1, x: 100, y: 100 };

  it.each([
    { axis: "x", dragged: 5000, held: 952 },
    { axis: "x", dragged: -5000, held: -352 },
    { axis: "y", dragged: 5000, held: 952 },
    { axis: "y", dragged: -5000, held: -152 },
  ])("brings a 400 x 200 drawing dragged to $axis $dragged back to $axis $held in a 1000 x 1000 box", ({ axis, dragged, held }) => {
    expect(keepInView({ ...resting, [axis]: dragged }, drawing, box)).toEqual({ ...resting, [axis]: held });
  });

  it("leaves a transform at 100, 100 where it is in an unmeasured 0 x 0 box", () => {
    expect(keepInView(resting, drawing, { width: 0, height: 0 })).toEqual(resting);
  });
});

describe("revealArea", () => {
  const area = { minX: 100, minY: 100, maxX: 300, maxY: 200 };
  const box = { width: 1000, height: 1000 };

  it("brings an area at 100 to 300 scrolled off to the left back to x -76 in a 1000 wide box", () => {
    expect(revealArea({ scale: 1, x: -2000, y: 0 }, area, box)).toEqual({ scale: 1, x: -76, y: 0 });
  });

  it("brings an area at 100 to 200 scrolled off the top back to y -76 in a 1000 high box", () => {
    expect(revealArea({ scale: 1, x: 0, y: -2000 }, area, box)).toEqual({ scale: 1, x: 0, y: -76 });
  });

  it("moves an area at y 600 to 700 to y -324 above a 400px strip covering the bottom of an 800px box", () => {
    const lowArea = { minX: 100, minY: 600, maxX: 300, maxY: 700 };
    expect(revealArea({ scale: 1, x: 0, y: 0 }, lowArea, { width: 1000, height: 800 }, 400)).toEqual({
      scale: 1,
      x: 0,
      y: -324,
    });
  });

  it("leaves a transform at 0, 0 where it is in an unmeasured 0 x 0 box", () => {
    expect(revealArea({ scale: 1, x: 0, y: 0 }, area, { width: 0, height: 0 })).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
