import { afterEach, describe, expect, it, vi } from "vitest";
import { defineStation } from "./index.js";
import { Floor } from "./floor.js";

const succeed = async () => ({ outcome: "success" });

describe("defineStation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("refuses to start with no floor to reach, naming the variable", () => {
    expect(() => defineStation("close-issue", succeed, { token: "t", floorUrl: undefined, start: false })).toThrow(/FLOOR_API_URL/);
  });

  it("refuses to start with no token, naming the variable", () => {
    expect(() => defineStation("close-issue", succeed, { floorUrl: "http://floor.test", start: false })).toThrow(/FLOOR_SERVICE_TOKEN/);
  });

  it("takes both from its options", () => {
    const station = defineStation("close-issue", succeed, { floorUrl: "http://floor.test", token: "t", start: false });

    expect(station.once).toBeTypeOf("function");
  });

  it("reports HELLO when shout receives hello", async () => {
    vi.spyOn(Floor.prototype, "claim").mockResolvedValue([
      { id: "event", attempts: 1, tags: ["station:shout"], name: "station_run.dispatch", payload: { visitId: "visit" } },
    ]);
    vi.spyOn(Floor.prototype, "brief").mockResolvedValue({
      visitId: "visit", runId: "run", lineId: "line", nodeId: "shout", iteration: 1,
      floorBaseUrl: "http://floor.test", token: "visit-token", deadlineMinutes: 1, settings: null,
      needs: [{ kind: "value", name: "text", value: "hello" }], produces: [], conversation: { mode: "new", save: false },
    });
    const report = vi.spyOn(Floor.prototype, "report").mockResolvedValue();
    vi.spyOn(Floor.prototype, "ack").mockResolvedValue();
    vi.stubEnv("FLOOR_API_URL", "http://floor.test");
    vi.stubEnv("FLOOR_SERVICE_TOKEN", "test-token");

    //#region shout-station
    const station = defineStation("shout", async ({ needs }) => ({
      outcome: "success",
      produced: { shouted: needs.text.toUpperCase() },
    }), { start: false });

    await station.once();
    //#endregion shout-station

    expect(report).toHaveBeenCalledWith("visit", { outcome: "success", produced: { shouted: "HELLO" } }, "station:shout");
  });
});
