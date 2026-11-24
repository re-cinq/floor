// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { markerLine } from "./metro/line.fixtures";
import type { ElkLayout } from "./elk-layout";
import { useElkLayout } from "./use-elk-layout";

describe("useElkLayout", () => {
  it("returns the layout with the review node once it resolves, for a single-station line", async () => {
    const singleStationLine = markerLine({ entry: "review", exit: "review", nodeIds: ["review"], edges: [] });
    const { result } = renderHook(() => useElkLayout(singleStationLine));

    await waitFor(() => expect(result.current).toMatchObject({ nodes: [{ id: "review" }] }));
  });

  it("keeps the newer layout when an older one resolves last", async () => {
    const lineA = markerLine({ entry: "a", exit: "a", nodeIds: ["a"], edges: [] });
    const lineB = markerLine({ entry: "b", exit: "b", nodeIds: ["b"], edges: [] });
    const layoutOf = (id: string): ElkLayout => ({
      nodes: [{ id, x: 0, y: 0, width: 1, height: 1, ports: [] }],
      edges: [],
      contentBox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    });
    const resolvers = new Map<string, (layout: ElkLayout) => void>();
    const deferredLayout = (definition: { entry: string }) =>
      new Promise<ElkLayout>((resolve) => resolvers.set(definition.entry, resolve));

    const { result, rerender } = renderHook(({ line }) => useElkLayout(line, undefined, deferredLayout), {
      initialProps: { line: lineA },
    });
    rerender({ line: lineB });
    await act(async () => resolvers.get("b")?.(layoutOf("b")));
    await act(async () => resolvers.get("a")?.(layoutOf("a")));

    expect(result.current).toEqual(layoutOf("b"));
  });

  it("passes the size and the layout options to the layout function", async () => {
    const line = markerLine({ entry: "a", exit: "a", nodeIds: ["a"], edges: [] });
    const calls: unknown[][] = [];

    const recordingLayout = async (...args: unknown[]): Promise<ElkLayout> => {
      calls.push(args);

      return { nodes: [], edges: [], contentBox: { minX: 0, minY: 0, maxX: 1, maxY: 1 } };
    };

    const size = { width: 10, height: 20 };
    const options = { compactStops: true };

    renderHook(() => useElkLayout(line, size, recordingLayout as never, options));

    await waitFor(() => expect(calls).toEqual([[line, size, options]]));
  });
});
