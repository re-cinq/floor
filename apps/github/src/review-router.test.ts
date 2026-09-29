import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Brief } from "@floor/station";
import { startFakeFloor, type FakeFloor } from "./fake-floor.js";
import { putRouter, reviewRouter, ROUTER_LINE, ROUTER_STATION } from "./review-router.js";
import { toolsReading } from "./test-support.js";

let floor: FakeFloor;

beforeAll(async () => {
  floor = await startFakeFloor();
});

afterAll(async () => {
  await floor.close();
});

function routed(visitId: string) {
  const router = reviewRouter({ floorUrl: floor.floorUrl, token: "floor-token" });

  return router(visit(visitId), toolsReading(""));
}

function visit(visitId: string): Brief {
  return { visitId, iteration: 1, needs: { repository: "github.com/re-cinq/floor", head_ref: "feature/x", pr_url: "https://github.com/re-cinq/floor/pull/12", title: "Add the sweeper" } };
}

describe("reviewRouter", () => {
  it("routes to the full review when the pull request was never reviewed", async () => {
    floor.runs = [];

    const report = await routed("never-reviewed");

    expect(report).toEqual({ outcome: "success", produced: { routed_to: "code-review" } });
  });

  it("posts the full-review event for a pull request never reviewed", async () => {
    floor.runs = [];

    await routed("posts-full-event");

    expect(floor.posted.at(-1)).toMatchObject({ name: "review.full.requested" });
  });

  it("routes to the recheck when a full review already succeeded", async () => {
    floor.runs = [{ outcome: "success" }];

    const report = await routed("already-reviewed");

    expect(report).toEqual({ outcome: "success", produced: { routed_to: "code-review-recheck" } });
  });

  it("still routes to the full review when the only run on record failed", async () => {
    floor.runs = [{ outcome: "failed" }];

    const report = await routed("only-a-failure");

    expect(report).toEqual({ outcome: "success", produced: { routed_to: "code-review" } });
  });

  it("throws when the floor refuses the event", async () => {
    floor.runs = [];
    floor.status = 500;

    await expect(routed("floor-down")).rejects.toThrow(/the floor answered 500/);

    floor.status = 200;
  });
});

describe("putRouter", () => {
  it("puts the router's own station and line to the floor", async () => {
    await putRouter({ floorUrl: floor.floorUrl, token: "floor-token" });

    expect(floor.posted.slice(-2)).toEqual([ROUTER_STATION, ROUTER_LINE]);
  });
});
