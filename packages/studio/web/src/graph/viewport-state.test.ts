import { describe, it, expect } from "vitest";
import { IDENTITY } from "./viewport";
import { initialViewport, viewportReducer, type ViewportState } from "./viewport-state";

describe("viewportReducer", () => {
  const fittedState: ViewportState = {
    drawing: { width: 400, height: 200 },
    box: { width: 1000, height: 1000 },
    transform: { scale: 1, x: 300, y: 400 },
    fitted: true,
  };
  const movedState: ViewportState = { ...fittedState, transform: { scale: 1, x: 350, y: 380 }, fitted: false };
  const largeDrawingState: ViewportState = {
    drawing: { width: 3000, height: 2000 },
    box: { width: 1000, height: 1000 },
    transform: IDENTITY,
    fitted: false,
  };

  it("fits a 2000 x 1000 drawing at scale 0.5 once a 1000 x 1000 box is measured", () => {
    const drawing = { width: 2000, height: 1000 };
    const box = { width: 1000, height: 1000 };

    expect(viewportReducer(initialViewport(drawing), { type: "measured", box })).toEqual({
      drawing,
      box,
      transform: { scale: 0.5, x: 0, y: 250 },
      fitted: true,
    });
  });

  it("keeps a view the person moved to 350, 380 when the box is measured again at 800 x 600", () => {
    const box = { width: 800, height: 600 };

    expect(viewportReducer(movedState, { type: "measured", box })).toEqual({ ...movedState, box });
  });

  it("holds a view the person moved to 350, 380 at 152, 152 when the box shrinks to 200 x 200", () => {
    const box = { width: 200, height: 200 };

    expect(viewportReducer(movedState, { type: "measured", box })).toEqual({
      ...movedState,
      box,
      transform: { scale: 1, x: 152, y: 152 },
    });
  });

  it("fits a drawing redrawn at 800 x 400 at 100, 300 while the view is still fitted", () => {
    const drawing = { width: 800, height: 400 };

    expect(viewportReducer(fittedState, { type: "redrawn", drawing })).toEqual({
      ...fittedState,
      drawing,
      transform: { scale: 1, x: 100, y: 300 },
    });
  });

  it("moves a fitted 400 x 200 drawing by a drag of 50, -20 and marks it no longer fitted", () => {
    expect(viewportReducer(fittedState, { type: "dragged", drag: { x: 50, y: -20 } })).toEqual({
      ...fittedState,
      transform: { scale: 1, x: 350, y: 380 },
      fitted: false,
    });
  });

  it("holds a 400 x 200 drawing at x 952 when a drag of 5000, 0 would take it out of a 1000 x 1000 box", () => {
    expect(viewportReducer(fittedState, { type: "dragged", drag: { x: 5000, y: 0 } })).toEqual({
      ...fittedState,
      transform: { scale: 1, x: 952, y: 400 },
      fitted: false,
    });
  });

  it("moves a 400 x 200 drawing up 50 and left 30 for a scroll of 30, 50 and marks it no longer fitted", () => {
    expect(viewportReducer(fittedState, { type: "scrolled", delta: { x: 30, y: 50 } })).toEqual({
      ...fittedState,
      transform: { scale: 1, x: 270, y: 350 },
      fitted: false,
    });
  });

  it("doubles the scale at the pointer 100, 50 for a pinch of -100 and marks it no longer fitted", () => {
    const originState: ViewportState = { ...fittedState, transform: IDENTITY };

    expect(viewportReducer(originState, { type: "pinched", anchor: { x: 100, y: 50 }, delta: -100 })).toEqual({
      ...originState,
      transform: { scale: 2, x: -100, y: -50 },
      fitted: false,
    });
  });

  it("enlarges a fitted view to scale 1.25 around the center of a 1000 x 1000 box when zoomed in", () => {
    expect(viewportReducer(fittedState, { type: "zoomed", direction: "in" })).toEqual({
      ...fittedState,
      transform: { scale: 1.25, x: 250, y: 375 },
      fitted: false,
    });
  });

  it("shrinks a fitted view to scale 0.8 around the center of a 1000 x 1000 box when zoomed out", () => {
    expect(viewportReducer(fittedState, { type: "zoomed", direction: "out" })).toEqual({
      ...fittedState,
      transform: { scale: 0.8, x: 340, y: 420 },
      fitted: false,
    });
  });

  it("puts a view the person moved to 350, 380 back to the fit at 300, 400 and marks it fitted", () => {
    expect(viewportReducer(movedState, { type: "fit" })).toEqual(fittedState);
  });

  it("pans to x -724 to bring a node at 1500 to 1700 inside a 1000 wide box with a 24 margin", () => {
    const area = { minX: 1500, minY: 100, maxX: 1700, maxY: 200 };

    expect(viewportReducer(largeDrawingState, { type: "revealed", area })).toEqual({
      ...largeDrawingState,
      transform: { scale: 1, x: -724, y: 0 },
    });
  });

  it("pans to y -324 to bring a node at 600 to 700 above a 400px strip covering the bottom of the box", () => {
    const area = { minX: 100, minY: 600, maxX: 300, maxY: 700 };
    const tallBoxState = { ...largeDrawingState, box: { width: 1000, height: 800 }, transform: { scale: 1, x: 0, y: 0 } };

    expect(viewportReducer(tallBoxState, { type: "revealed", area, coveredBelow: 400 })).toEqual({
      ...tallBoxState,
      transform: { scale: 1, x: 0, y: -324 },
    });
  });

  it("leaves the view where it is when revealing a node at 100 to 300 that is already inside a 1000 wide box", () => {
    const area = { minX: 100, minY: 100, maxX: 300, maxY: 200 };

    expect(viewportReducer(largeDrawingState, { type: "revealed", area })).toEqual(largeDrawingState);
  });

  it("keeps a fitted view fitted when revealing a node at 0 to 200 that is already in view", () => {
    const area = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

    expect(viewportReducer(fittedState, { type: "revealed", area })).toEqual(fittedState);
  });
});
