// The stations of a small fan-out line — one that lists, one that works per entry, one that joins — shared by the tests that check a fan-out line and run one.
import type { LineBody, StationBody } from "./types.js";

export const FAN_STATIONS: Record<string, StationBody> = {
  splitter: { kind: "service", outcomes: ["success"], needs: [], produces: [{ name: "items", kind: "value" }] },
  worker: {
    kind: "service",
    outcomes: ["success", "failed"],
    needs: [{ name: "item", kind: "value" }],
    produces: [{ name: "result", kind: "value" }],
  },
  merger: { kind: "service", outcomes: ["success"], needs: [{ name: "results", kind: "value", collect: "result" }], produces: [] },
};

/** The line those stations make: split fans out to work, merge joins, and a failed branch ends the run as failed. */
export const fanLine = (patch: Partial<LineBody> = {}): LineBody => ({
  entry: "split",
  exit: "done",
  fail: "failed",
  args: {},
  nodes: [
    { id: "split", station: "splitter", fanout: { over: "items", to: "work" } },
    { id: "work", station: "worker" },
    { id: "merge", station: "merger" },
    { id: "done" },
    { id: "failed" },
  ],
  edges: [
    { from: "split", to: "work", on: "success" },
    { from: "work", to: "merge", on: "success" },
    { from: "work", to: "failed", on: "failed" },
    { from: "merge", to: "done", on: "success" },
  ],
  ...patch,
});
