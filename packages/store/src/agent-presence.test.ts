import { describe, expect, it } from "vitest";
import { presenceState } from "./agent-presence.js";

const now = new Date("2026-11-01T12:00:00Z");
const seenTenMinutesAgo = new Date("2026-11-01T11:50:00Z");

function eastAndWest(held: { east?: string; west?: string }, westSeenAt = now) {
  return presenceState({
    latest: "h2",
    clusters: [
      { id: "east", lastSeenAt: now },
      { id: "west", lastSeenAt: westSeenAt },
    ],
    holdings: Object.entries(held).map(([clusterId, hash]) => ({ clusterId, hash })),
    now,
  });
}

describe("presenceState", () => {
  it("is all when clusters east and west both hold the latest hash h2", () => {
    expect(eastAndWest({ east: "h2", west: "h2" })).toEqual({
      state: "all",
      latest: "h2",
      clusters: [
        { id: "east", hash: "h2", current: true },
        { id: "west", hash: "h2", current: true },
      ],
    });
  });

  it("is some when west still holds h1 while east holds the latest h2", () => {
    expect(eastAndWest({ east: "h2", west: "h1" }).state).toBe("some");
  });

  it("is some when west holds no version at all while east holds h2", () => {
    expect(eastAndWest({ east: "h2" })).toMatchObject({ state: "some", clusters: [{ id: "east", current: true }, { id: "west", hash: null, current: false }] });
  });

  it("is none when no cluster holds any version", () => {
    expect(eastAndWest({}).state).toBe("none");
  });

  it("is none when there are no clusters", () => {
    expect(presenceState({ latest: "h2", clusters: [], holdings: [], now }).state).toBe("none");
  });

  it("leaves out west, last seen 10 minutes ago, so east alone holding h2 is all", () => {
    expect(eastAndWest({ east: "h2", west: "h1" }, seenTenMinutesAgo)).toEqual({ state: "all", latest: "h2", clusters: [{ id: "east", hash: "h2", current: true }] });
  });
});
