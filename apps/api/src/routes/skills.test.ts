import { describe, expect, it } from "vitest";
import { injectJson, setupTestServer } from "../test-server.js";

const { server } = setupTestServer();

describe("GET /skills/settings.json", () => {
  it("serves the agent's settings to a pod's init, which fetches with no credential", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/skills/settings.json" });

    expect({ statusCode: response.statusCode, settings: response.result }).toEqual({ statusCode: 200, settings: {} });
  });
});
