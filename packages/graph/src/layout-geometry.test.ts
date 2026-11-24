import { describe, expect, it } from "vitest";
import type { ElkLayout } from "./elk-layout";
import { linesOverLabels, linesThroughStations, tinyTurns } from "./layout-geometry";

type Station = ElkLayout["nodes"][number];
type Edge = ElkLayout["edges"][number];

const stationAt = (id: string, across: number): Station => ({ id, x: across, y: 50, width: 140, height: 60, ports: [] });

const edgeAt = ({ from, to, on, d, labelBox }: Pick<Edge, "from" | "to" | "on" | "d" | "labelBox">): Edge => ({
  from,
  to,
  on,
  d,
  labelBox,
  kind: "forward",
  mid: { x: 0, y: 0, vertical: false },
});

const layoutOf = (nodes: Station[], edges: Edge[]): ElkLayout => ({ nodes, edges, contentBox: { minX: 0, minY: 0, maxX: 520, maxY: 400 } });

const labelBoxAt = (down: number, minX = 221, maxX = 279) => ({ minX, minY: down - 8, maxX, maxY: down + 8 });

describe("linesThroughStations", () => {
  it("lists edge a|c|success through station b when its path runs straight across b", () => {
    const layout = layoutOf(
      [stationAt("a", 50), stationAt("b", 250), stationAt("c", 450)],
      [edgeAt({ from: "a", to: "c", on: "success", d: "M 120 50 L 380 50", labelBox: labelBoxAt(50) })],
    );

    expect(linesThroughStations(layout)).toEqual([{ edge: "a|c|success", station: "b" }]);
  });

  it("returns nothing for edge a|b|success whose path starts inside a and ends inside b", () => {
    const layout = layoutOf(
      [stationAt("a", 50), stationAt("b", 250)],
      [edgeAt({ from: "a", to: "b", on: "success", d: "M 50 50 L 250 50", labelBox: labelBoxAt(50, 121, 179) })],
    );

    expect(linesThroughStations(layout)).toEqual([]);
  });
});

describe("linesOverLabels", () => {
  it("lists edge a|b|success over the label of c|d|failed when its path runs through that label box", () => {
    const layout = layoutOf(
      [stationAt("a", 50), stationAt("b", 450), stationAt("c", 50), stationAt("d", 450)],
      [
        edgeAt({ from: "a", to: "b", on: "success", d: "M 120 50 L 380 50", labelBox: labelBoxAt(150) }),
        edgeAt({ from: "c", to: "d", on: "failed", d: "M 120 300 L 380 300", labelBox: labelBoxAt(50, 240, 290) }),
      ],
    );

    expect(linesOverLabels(layout)).toEqual([{ edge: "a|b|success", label: "c|d|failed" }]);
  });

  it("returns nothing for edge a|b|success whose path runs through its own label box", () => {
    const layout = layoutOf(
      [stationAt("a", 50), stationAt("b", 450)],
      [edgeAt({ from: "a", to: "b", on: "success", d: "M 120 50 L 380 50", labelBox: labelBoxAt(50) })],
    );

    expect(linesOverLabels(layout)).toEqual([]);
  });
});

describe("tinyTurns", () => {
  it("lists edge a|b|success with length 4 when its middle segment is 4 px under a minimum of 16", () => {
    const layout = layoutOf(
      [stationAt("a", 50), stationAt("b", 250)],
      [edgeAt({ from: "a", to: "b", on: "success", d: "M 100 50 L 200 50 L 200 54 L 300 54", labelBox: labelBoxAt(50) })],
    );

    expect(tinyTurns(layout, 16)).toEqual([{ edge: "a|b|success", length: 4 }]);
  });

  it("returns [] for edge a|b|success whose 4 px first and last segments attach to station ports", () => {
    const layout = layoutOf(
      [stationAt("a", 50), stationAt("b", 150)],
      [edgeAt({ from: "a", to: "b", on: "success", d: "M 100 50 L 104 50 L 104 150 L 108 150", labelBox: labelBoxAt(100) })],
    );

    expect(tinyTurns(layout, 16)).toEqual([]);
  });
});
