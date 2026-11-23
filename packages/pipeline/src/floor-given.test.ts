import { describe, expect, it } from "vitest";
import { floorGiven } from "./floor-given.js";

const USAGE = "usage";

describe("floorGiven", () => {
  it("reaches the floor FLOOR_API_URL names when no --floor is given", () => {
    expect(floorGiven(undefined, { FLOOR_API_URL: "http://localhost:8180", FLOOR_SERVICE_TOKEN: "floor-dev-token" }, USAGE)).toEqual({ url: "http://localhost:8180", token: "floor-dev-token" });
  });

  it("takes --floor over FLOOR_API_URL", () => {
    expect(floorGiven("https://floor.example", { FLOOR_API_URL: "http://localhost:8180", FLOOR_SERVICE_TOKEN: "token" }, USAGE)).toMatchObject({ url: "https://floor.example" });
  });

  it("drops the slash a url ends with", () => {
    expect(floorGiven("https://floor.example/", { FLOOR_SERVICE_TOKEN: "token" }, USAGE)).toMatchObject({ url: "https://floor.example" });
  });

  it("refuses when neither --floor nor FLOOR_API_URL names a floor", () => {
    expect(() => floorGiven(undefined, { FLOOR_SERVICE_TOKEN: "token" }, USAGE)).toThrow(new Error("a floor is named with --floor or FLOOR_API_URL, and reached with FLOOR_SERVICE_TOKEN\n\nusage"));
  });

  it("refuses without FLOOR_SERVICE_TOKEN", () => {
    expect(() => floorGiven("https://floor.example", {}, USAGE)).toThrow(new Error("a floor is named with --floor or FLOOR_API_URL, and reached with FLOOR_SERVICE_TOKEN\n\nusage"));
  });
});
