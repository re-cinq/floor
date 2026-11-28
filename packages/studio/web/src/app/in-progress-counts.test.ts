import { describe, expect, it } from "vitest";
import type { TestRunListings } from "@/socket/studio-connection";
import { inProgressCounts } from "./in-progress-counts";

describe("inProgressCounts", () => {
  it("counts review-loop's waiting run and not its stopped run as 1 in progress", () => {
    const listings: TestRunListings = [
      {
        run: "run-stopped",
        line: "review-loop",
        folder: "/lines/review-loop",
        status: "stopped",
        startedAt: "2026-11-27T10:00:00.000Z",
      },
      {
        run: "run-waiting",
        line: "review-loop",
        folder: "/lines/review-loop",
        status: "waiting",
        startedAt: "2026-11-28T10:00:00.000Z",
      },
    ];

    expect(inProgressCounts(listings)).toEqual({ "review-loop": 1 });
  });
});
