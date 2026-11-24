import { describe, it, expect } from "vitest";
import { layoutWithElk } from "./elk-layout";
import { markerLine } from "./metro/line.fixtures";

function straightSegmentOf(path: string): number[] {
  const [, ...coordinates] = path.match(/^M (\S+) (\S+) L (\S+) (\S+)$/)!;

  return coordinates.map(Number);
}

describe("layoutWithElk", () => {
  const twoStationLine = markerLine({ entry: "write", nodeIds: ["write", "done"], edges: [["write", "done", "success"]] });

  it("returns one 140x60 node centred at 82,42 and no edges for a single-station line", async () => {
    const singleStationLine = markerLine({ entry: "review", exit: "review", nodeIds: ["review"], edges: [] });

    const { nodes, edges } = await layoutWithElk(singleStationLine);

    expect({ nodes, edges }).toEqual({
      nodes: [{ id: "review", x: 82, y: 42, width: 140, height: 60 }],
      edges: [],
    });
  });

  it("returns the 164x84 root as the content box for a single-station line", async () => {
    const singleStationLine = markerLine({ entry: "review", exit: "review", nodeIds: ["review"], edges: [] });

    const { contentBox } = await layoutWithElk(singleStationLine);

    expect(contentBox).toEqual({ minX: 0, minY: 0, maxX: 164, maxY: 84 });
  });

  it("returns a forward write -> done success edge", async () => {
    const { edges } = await layoutWithElk(twoStationLine);

    expect(edges[0]).toMatchObject({ from: "write", to: "done", on: "success", kind: "forward" });
  });

  it("returns the forward write -> done path as one horizontal segment from write's right edge to done's left edge", async () => {
    const { nodes, edges } = await layoutWithElk(twoStationLine);
    const write = nodes.find((node) => node.id === "write")!;
    const done = nodes.find((node) => node.id === "done")!;

    const [startX, startY, endX, endY] = straightSegmentOf(edges[0].d);

    expect({
      startsAtOrRightOfWrite: startX >= write.x + write.width / 2,
      endsAtOrLeftOfDone: endX <= done.x - done.width / 2,
      isHorizontal: startY === endY,
      withinStationHeight: startY >= write.y - write.height / 2 && startY <= write.y + write.height / 2,
    }).toEqual({ startsAtOrRightOfWrite: true, endsAtOrLeftOfDone: true, isHorizontal: true, withinStationHeight: true });
  });

  it("returns the write -> done success mid as the horizontal centre of its label box", async () => {
    const { edges } = await layoutWithElk(twoStationLine);
    const { minX, minY, maxX, maxY } = edges[0].labelBox;

    expect(edges[0].mid).toEqual({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, vertical: false });
  });

  it("returns the write -> done success label box as 58 wide and 16 high", async () => {
    const { edges } = await layoutWithElk(twoStationLine);
    const { minX, minY, maxX, maxY } = edges[0].labelBox;

    expect({ width: maxX - minX, height: maxY - minY }).toEqual({ width: 58, height: 16 });
  });

  it("returns kind self for the review -> review failed edge", async () => {
    const retryLine = markerLine({
      entry: "review",
      nodeIds: ["review", "done"],
      edges: [
        ["review", "done", "success"],
        ["review", "review", "failed"],
      ],
    });

    const { edges } = await layoutWithElk(retryLine);

    expect(edges.find((edge) => edge.from === "review" && edge.to === "review")).toMatchObject({ kind: "self" });
  });

  it("returns kind back for the review -> write changes_requested edge", async () => {
    const revisionLine = markerLine({
      entry: "write",
      nodeIds: ["write", "review", "done"],
      edges: [
        ["write", "review", "success"],
        ["review", "done", "success"],
        ["review", "write", "changes_requested"],
      ],
    });

    const { edges } = await layoutWithElk(revisionLine);

    expect(edges.find((edge) => edge.from === "review" && edge.to === "write")).toMatchObject({ kind: "back" });
  });
});
