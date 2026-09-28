import { describe, expect, it } from "vitest";
import { setupEventsFixture } from "./events.fixtures.js";

const { store, fakeRunId } = setupEventsFixture();

describe("EventStore.feed", () => {
  it("pages forward by cursor without skipping or repeating", async () => {
    const runId = fakeRunId();

    for (let index = 0; index < 5; index++) {
      await store().enqueue({ name: "node.review.start", payload: { index }, runId });
    }

    const first = await store().feed({ runId, limit: 2 });
    const second = await store().feed({ runId, after: first.nextCursor!, limit: 2 });
    const third = await store().feed({ runId, after: second.nextCursor!, limit: 2 });
    const pages = [...first.items, ...second.items, ...third.items];

    expect(pages.map((event) => (event.payload as { index: number }).index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("sets nextCursor to null once the page is not full", async () => {
    const runId = fakeRunId();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    const page = await store().feed({ runId, limit: 50 });

    expect(page.nextCursor).toBeNull();
  });

  it("filters by name alone", async () => {
    await store().enqueue({ name: "node.review.start", payload: {} });
    await store().enqueue({ name: "node.done.start", payload: {} });

    const page = await store().feed({ name: "node.done.start", limit: 50 });

    expect(page.items.map((event) => event.name)).toEqual(["node.done.start"]);
  });

  it("filters by run alone", async () => {
    const runId = fakeRunId();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().enqueue({ name: "node.review.start", payload: {}, runId: fakeRunId() });

    const page = await store().feed({ runId, limit: 50 });

    expect(page.items).toHaveLength(1);
  });

  it("filters by visitId alone, matching payload.visitId", async () => {
    await store().enqueue({ name: "station_run.reported", payload: { visitId: "v1" } });
    await store().enqueue({ name: "station_run.reported", payload: { visitId: "v2" } });

    const page = await store().feed({ visitId: "v1", limit: 50 });

    expect(page.items.map((event) => event.payload)).toEqual([{ visitId: "v1" }]);
  });

  it("combines two filters", async () => {
    const runId = fakeRunId();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().enqueue({ name: "node.done.start", payload: {}, runId });
    await store().enqueue({ name: "node.review.start", payload: {}, runId: fakeRunId() });

    const page = await store().feed({ runId, name: "node.review.start", limit: 50 });

    expect(page.items).toHaveLength(1);
  });
});
