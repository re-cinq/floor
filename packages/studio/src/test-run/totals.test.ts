import { describe, expect, it } from "vitest";
import { totalsOf, type VisitMeasure } from "./totals.js";

describe("totalsOf", () => {
  it("counts write's agent visit with no stated cost as 1 unstated, not as $0", () => {
    expect(totalsOf([{ nodeId: "write", mode: "local", durationMs: 8400 }])).toEqual({
      run: { visits: 1, durationMs: 8400, costUsd: 0, costUnstated: 1 },
      nodes: [{ nodeId: "write", visits: 1, durationMs: 8400, costUsd: 0, costUnstated: 1 }],
    });
  });

  it("counts write's agent visit that is still running as 1 visit with 0 unstated", () => {
    expect(totalsOf([{ nodeId: "write", mode: "local" }])).toEqual({
      run: { visits: 1, durationMs: 0, costUsd: 0, costUnstated: 0 },
      nodes: [{ nodeId: "write", visits: 1, durationMs: 0, costUsd: 0, costUnstated: 0 }],
    });
  });

  it("totals write at 2 visits, 13600 ms and $0.0731, review at 2 visits and 61000 ms, and the run at 74600 ms and $0.0731", () => {
    const visits: VisitMeasure[] = [
      { nodeId: "write", mode: "local", durationMs: 8400, costUsd: 0.0421 },
      { nodeId: "review", mode: "simulated", durationMs: 61000 },
      { nodeId: "write", mode: "local", durationMs: 5200, costUsd: 0.031 },
      { nodeId: "review", mode: "simulated" },
    ];

    expect(totalsOf(visits)).toEqual({
      run: { visits: 4, durationMs: 74600, costUsd: 0.0731, costUnstated: 0 },
      nodes: [
        { nodeId: "write", visits: 2, durationMs: 13600, costUsd: 0.0731, costUnstated: 0 },
        { nodeId: "review", visits: 2, durationMs: 61000, costUsd: 0, costUnstated: 0 },
      ],
    });
  });
});
