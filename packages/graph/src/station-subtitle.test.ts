import { describe, expect, it } from "vitest";
import { subtitleOf } from "./station-subtitle";

describe("subtitleOf", () => {
  it("reads agent · 2 visits for two closed visits and agent for a single visit", () => {
    const subtitles = [
      subtitleOf("agent", { count: 2, outcome: "success", open: false }),
      subtitleOf("agent", { count: 1, outcome: "success", open: false }),
    ];

    expect(subtitles).toEqual(["agent · 2 visits", "agent"]);
  });

  it("reads agent · open for a first visit that is still open", () => {
    expect(subtitleOf("agent", { count: 1, open: true })).toEqual("agent · open");
  });
});
