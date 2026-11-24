import { describe, expect, it } from "vitest";
import { stationVisitsOf } from "./station-visits";

describe("stationVisitsOf", () => {
  it("keeps outcome failed for a when its second visit is open", () => {
    const stations = stationVisitsOf([
      { nodeId: "a", iteration: 1, outcome: "failed", open: false },
      { nodeId: "a", iteration: 2, open: true },
    ]);

    expect(stations.get("a")?.outcome).toEqual("failed");
  });

  it("ends a on outcome success when its iteration 2 success is listed before its iteration 1 failure", () => {
    const stations = stationVisitsOf([
      { nodeId: "a", iteration: 2, outcome: "success", open: false },
      { nodeId: "a", iteration: 1, outcome: "failed", open: false },
    ]);

    expect(stations.get("a")?.outcome).toEqual("success");
  });
});
