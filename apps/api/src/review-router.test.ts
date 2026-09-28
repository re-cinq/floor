import { beforeAll, describe, expect, it } from "vitest";
import { ROUTER_LINE, ROUTER_STATION, putRouter, reviewRouter } from "@floor/github/review-router";
import { defineStation } from "@floor/station";
import type { LineBody } from "@floor/store";
import { SERVICE_TOKEN, setupTestServer } from "./test-server.js";

const { server, deps, loop } = setupTestServer();

const REPOSITORY = "github.com/re-cinq/floor";
const PULL_REQUEST = "https://github.com/re-cinq/floor/pull/12";
const PUSHED = { repository: REPOSITORY, repo: REPOSITORY, head_ref: "sweeper", pull_request_url: PULL_REQUEST, title: "Add the sweeper", draft: false };

const REVIEW_LINE: LineBody = {
  entry: "review",
  exit: "done",
  args: { pr_url: { kind: "value", subject: true } },
  nodes: [{ id: "review" }, { id: "done" }],
  edges: [{ from: "review", to: "done", on: "always" }],
};

let floor = { floorUrl: "", token: SERVICE_TOKEN };

beforeAll(async () => {
  await server().start();
  floor = { floorUrl: `http://localhost:${server().info.port}`, token: SERVICE_TOKEN };
});

async function reviewedOnce(outcome: "settles" | "is cancelled"): Promise<void> {
  await deps().definitions.put("line", "code-review", REVIEW_LINE);
  const { run } = await deps().runs.start({ lineId: "code-review", repo: REPOSITORY, startItems: { pr_url: { kind: "value", ref: PULL_REQUEST, by: "start" } } });

  if (outcome === "is cancelled") await deps().runs.cancel(run.id, "superseded");
  await loop().pass();
}

async function pushed(): Promise<string[]> {
  await putRouter(floor);
  await deps().events.enqueue({ name: "github.pull_request.synchronize", payload: PUSHED });
  await loop().pass();
  await defineStation("review-router", reviewRouter(floor), { ...floor, start: false }).once();
  const requested = await deps().pool.query("select name from events where name like 'review.%' order by id");

  return requested.rows.map((row: { name: string }) => row.name);
}

describe("putRouter", () => {
  it("puts a line and a station the floor accepts, and may be run again", async () => {
    await putRouter(floor);
    await putRouter(floor);
    const line = await deps().definitions.versions("line", ROUTER_LINE.id);

    expect(line).toHaveLength(1);
  });

  it("names its station as the floor knows it", async () => {
    await putRouter(floor);
    const station = await deps().definitions.latest<{ kind: string }>("station", ROUTER_STATION.id);

    expect(station?.body.kind).toBe("service");
  });
});

describe("the review router", () => {
  it("asks for the full review of a pull request never reviewed", async () => {
    expect(await pushed()).toEqual(["review.full.requested"]);
  });

  it("asks for the recheck of a pull request already reviewed", async () => {
    await reviewedOnce("settles");

    expect(await pushed()).toEqual(["review.recheck.requested"]);
  });

  it("asks for the full review again when the one before did not go well", async () => {
    await reviewedOnce("is cancelled");

    expect(await pushed()).toEqual(["review.full.requested"]);
  });

  it("passes on what the line it asks for starts from", async () => {
    await pushed();
    const requested = await deps().pool.query("select payload from events where name = 'review.full.requested'");
    const [asked] = requested.rows as { payload: unknown }[];

    expect(asked!.payload).toEqual({ repository: REPOSITORY, repo: REPOSITORY, head_ref: "sweeper", pull_request_url: PULL_REQUEST, title: "Add the sweeper", draft: false });
  });

  it("says in the bag where it sent the pull request", async () => {
    await pushed();
    await loop().pass();
    const routed = await deps().runs.list({ lineId: ROUTER_LINE.id }, { limit: 1 });
    const [run] = routed.items;
    const bag = await deps().runs.bag(run!.id);

    expect(bag.routed_to.ref).toBe("code-review");
  });
});
