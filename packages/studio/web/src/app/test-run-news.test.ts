import { describe, expect, it } from "vitest";
import type { TestChangedFrame, TestRunListings } from "@/socket/studio-connection";
import { bringsNews } from "./test-run-news";

const listings: TestRunListings = [
  { run: "run-1", line: "review-loop", folder: "001", status: "running", startedAt: "2026-01-01T00:00:00Z" },
  {
    run: "run-2",
    line: "review-loop",
    folder: "002",
    status: "settled",
    startedAt: "2026-01-01T00:00:01Z",
    ending: { outcome: "failed", reason: "boom" },
  },
];

function frame(run: string, state: Record<string, unknown>): TestChangedFrame {
  return { type: "test.changed", run, state } as unknown as TestChangedFrame;
}

describe("bringsNews", () => {
  it.each([
    { name: "a run the list does not hold", changed: frame("run-3", { status: "running" }) },
    { name: "a status the list shows differently", changed: frame("run-1", { status: "waiting" }) },
    { name: "an ending the list does not show", changed: frame("run-1", { status: "running", ending: { outcome: "finished" } }) },
    { name: "a different ending reason", changed: frame("run-2", { status: "settled", ending: { outcome: "failed", reason: "bang" } }) },
  ])("returns true for $name", ({ changed }) => {
    expect(bringsNews(listings, changed)).toBe(true);
  });

  it.each([
    { name: "a listed run with the same status", changed: frame("run-1", { status: "running" }) },
    { name: "a listed run with the same ending", changed: frame("run-2", { status: "settled", ending: { outcome: "failed", reason: "boom" } }) },
  ])("returns false for $name", ({ changed }) => {
    expect(bringsNews(listings, changed)).toBe(false);
  });
});
