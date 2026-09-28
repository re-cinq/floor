import { describe, expect, it } from "vitest";
import { defineStation } from "./station.js";

const succeed = async () => ({ outcome: "success" });

describe("defineStation", () => {
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
});
