// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import GraphViewport from "./GraphViewport";

function drawInBox(box: DOMRect, drawing = { width: 400, height: 200 }) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(box);

  render(
    <GraphViewport drawing={drawing}>
      <rect data-testid="drawn" />
    </GraphViewport>,
  );

  return screen.getByTestId("drawn").parentElement;
}

describe("GraphViewport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws its children at translate(0 0) scale(1) before its box is measured", () => {
    render(
      <GraphViewport drawing={{ width: 400, height: 200 }}>
        <rect data-testid="drawn" />
      </GraphViewport>,
    );

    const group = screen.getByTestId("drawn").parentElement;

    expect(group?.getAttribute("transform")).toBe("translate(0 0) scale(1)");
  });

  it("draws a 2000 x 1000 drawing at translate(0 250) scale(0.5) once its box measures 1000 x 1000", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000), { width: 2000, height: 1000 });

    expect(group?.getAttribute("transform")).toBe("translate(0 250) scale(0.5)");
  });

  it("moves a fitted 400 x 200 drawing from 300, 400 to 270, 350 for a wheel of 30, 50", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000));
    fireEvent.wheel(group!.closest("svg")!, { deltaX: 30, deltaY: 50 });

    expect(group?.getAttribute("transform")).toBe("translate(270 350) scale(1)");
  });

  it("zooms a fitted 400 x 200 drawing to scale 2 around the pointer at 500, 500 for a ctrl wheel of -100", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000));
    fireEvent.wheel(group!.closest("svg")!, { ctrlKey: true, deltaY: -100, clientX: 500, clientY: 500 });

    expect(group?.getAttribute("transform")).toBe("translate(100 300) scale(2)");
  });

  it("zooms around box point 500, 500 for a ctrl wheel at page point 600, 550 when the box sits at 100, 50", () => {
    const group = drawInBox(new DOMRect(100, 50, 1000, 1000));
    fireEvent.wheel(group!.closest("svg")!, { ctrlKey: true, deltaY: -100, clientX: 600, clientY: 550 });

    expect(group?.getAttribute("transform")).toBe("translate(100 300) scale(2)");
  });

  it("moves a fitted 400 x 200 drawing from 300, 400 to 350, 380 for a drag from 100, 100 to 150, 80", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000));
    const svg = group!.closest("svg")!;
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { clientX: 150, clientY: 80 });
    fireEvent.pointerUp(svg, { clientX: 150, clientY: 80 });

    expect(group?.getAttribute("transform")).toBe("translate(350 380) scale(1)");
  });

  it("enlarges a fitted 400 x 200 drawing to scale 1.25 around the centre at 250, 375 when Zoom in is pressed", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(group?.getAttribute("transform")).toBe("translate(250 375) scale(1.25)");
  });

  it("enlarges a fitted 400 x 200 drawing to scale 1.25 around the centre at 250, 375 when + is pressed", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000));
    fireEvent.keyDown(screen.getByRole("group", { name: "Graph viewport" }), { key: "+" });

    expect(group?.getAttribute("transform")).toBe("translate(250 375) scale(1.25)");
  });

  it("shrinks a fitted 400 x 200 drawing to scale 0.8 around the centre at 340, 420 when Zoom out is pressed", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));

    expect(group?.getAttribute("transform")).toBe("translate(340 420) scale(0.8)");
  });

  it("puts a zoomed 400 x 200 drawing back at 300, 400 scale 1 when Fit is pressed", () => {
    const group = drawInBox(new DOMRect(0, 0, 1000, 1000));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));

    expect(group?.getAttribute("transform")).toBe("translate(300 400) scale(1)");
  });

  it("pans a zoomed 800 x 400 drawing to x -586.5 when the area 760, 0 to 800, 40 is revealed past the right edge", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 1000));
    const drawing = { width: 800, height: 400 };
    const { rerender } = render(
      <GraphViewport drawing={drawing}>
        <rect data-testid="drawn" />
      </GraphViewport>,
    );
    for (let press = 0; press < 3; press++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    rerender(
      <GraphViewport drawing={drawing} reveal={{ minX: 760, minY: 0, maxX: 800, maxY: 40 }}>
        <rect data-testid="drawn" />
      </GraphViewport>,
    );

    const group = screen.getByTestId("drawn").parentElement;

    expect(group?.getAttribute("transform")).toBe("translate(-586.5 109.375) scale(1.953125)");
  });

  it("refits at 300, 400 scale 1 when the drawing changes from 2000 x 1000 to 400 x 200", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 1000));
    const { rerender } = render(
      <GraphViewport drawing={{ width: 2000, height: 1000 }}>
        <rect data-testid="drawn" />
      </GraphViewport>,
    );
    rerender(
      <GraphViewport drawing={{ width: 400, height: 200 }}>
        <rect data-testid="drawn" />
      </GraphViewport>,
    );

    const group = screen.getByTestId("drawn").parentElement;

    expect(group?.getAttribute("transform")).toBe("translate(300 400) scale(1)");
  });
});
