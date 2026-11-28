import { describe, expect, it } from "vitest";
import { pastListingOf } from "./past-listing.js";
import type { RunSummary } from "./run-summary.js";

const summaryWith = (fields: Pick<RunSummary, "status" | "ending">): RunSummary => ({
  line: "review-loop",
  startedAt: "2026-11-27T14:12:30.000Z",
  startItems: {},
  totals: { durationMs: 0, costUsd: 0 } as RunSummary["totals"],
  ...fields,
});

describe("pastListingOf", () => {
  it.each([
    { status: "settled", ending: { outcome: "finished" }, listed: { status: "settled", ending: { outcome: "finished" } } },
    { status: "waiting", ending: undefined, listed: { status: "stopped" } },
  ] as const)("lists a $status run as $listed.status", ({ status, ending, listed }) => {
    expect(pastListingOf("/runs/review-loop-1", summaryWith({ status, ending }))).toStrictEqual({
      run: "/runs/review-loop-1",
      line: "review-loop",
      folder: "/runs/review-loop-1",
      startedAt: "2026-11-27T14:12:30.000Z",
      ...listed,
    });
  });
});
