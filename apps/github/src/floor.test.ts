import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeFloor, type FakeFloor } from "./fake-floor.js";
import { floorPoster } from "./floor.js";

let floor: FakeFloor;

beforeAll(async () => {
  floor = await startFakeFloor();
});

afterAll(async () => {
  await floor.close();
});

describe("floorPoster", () => {
  it("posts the event to the floor", async () => {
    await floorPoster(floor.floorUrl, "floor-token")({ name: "github.pull_request.opened", payload: {}, dedupeKey: "github:1" });

    expect(floor.posted).toEqual([{ name: "github.pull_request.opened", payload: {}, dedupeKey: "github:1" }]);
  });

  it("throws when the floor refuses the event", async () => {
    floor.status = 500;

    await expect(floorPoster(floor.floorUrl, "floor-token")({ name: "github.pull_request.opened", payload: {}, dedupeKey: "github:2" })).rejects.toThrow(/the floor answered 500/);
  });
});
