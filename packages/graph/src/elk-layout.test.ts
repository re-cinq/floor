import { describe, it, expect } from "vitest";
import { layoutWithElk } from "./elk-layout";
import { markerLine } from "./metro/line.fixtures";

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

  it("returns a forward write -> done success edge as a straight M 152 42 L 250 42 path", async () => {
    const { edges } = await layoutWithElk(twoStationLine);

    expect(edges[0]).toMatchObject({
      from: "write",
      to: "done",
      on: "success",
      kind: "forward",
      d: "M 152 42 L 250 42",
    });
  });

  it("returns the write -> done success label centre 201,53 as a horizontal mid", async () => {
    const { edges } = await layoutWithElk(twoStationLine);

    expect(edges[0].mid).toEqual({ x: 201, y: 53, vertical: false });
  });

  it("returns the write -> done success label box 172,45 to 230,61", async () => {
    const { edges } = await layoutWithElk(twoStationLine);

    expect(edges[0].labelBox).toEqual({ minX: 172, minY: 45, maxX: 230, maxY: 61 });
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
