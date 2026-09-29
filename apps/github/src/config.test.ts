import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const FLOOR = { FLOOR_API_URL: "http://floor.test", FLOOR_SERVICE_TOKEN: "floor-service-token" };
const APP = { GITHUB_APP_ID: "12345", GITHUB_APP_PRIVATE_KEY: "a key" };

describe("loadConfig", () => {
  it("provides git credentials as a GitHub App asked to by name", () => {
    expect(loadConfig({ ...FLOOR, ...APP, GITHUB_GIT_CREDENTIALS: "1" }).gitCredentials).toBeTypeOf("function");
  });

  it("provides none for an app that was not asked to", () => {
    expect(loadConfig({ ...FLOOR, ...APP }).gitCredentials).toBeUndefined();
  });

  it("refuses to provide them from a token given outright", () => {
    expect(() => loadConfig({ ...FLOOR, GITHUB_TOKEN: "ghp_given", GITHUB_GIT_CREDENTIALS: "1" })).toThrow(/never handed to a pod/);
  });
});
