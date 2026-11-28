import { describe, expect, it } from "vitest";
import type { TestReadResult } from "@/socket/studio-connection";
import { overlayOf } from "./run-overlay";

const unreportedWriteVisit: TestReadResult["visits"][number] = {
  id: "001-write-1",
  nodeId: "write",
  iteration: 1,
  station: "draft-writer",
  kind: "agent",
  needs: {},
  report: null,
  openedAt: "2026-11-28T10:00:00.000Z",
};

describe("overlayOf", () => {
  it("draws write's unreported visit as not open when the run is stopped", () => {
    expect(overlayOf([unreportedWriteVisit], "stopped")).toEqual({
      visits: [{ nodeId: "write", iteration: 1, outcome: undefined, open: false }],
    });
  });
});
