import { describe, expect, it } from "vitest";
import { injectJson, setupTestServer } from "../test-server.js";

const { server, loop } = setupTestServer();

describe("GET /healthz", () => {
  it("is reachable with no bearer token", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /readyz", () => {
  it("is not ready while this instance does not hold the floor's lease", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(503);
  });

  it("reports ready once it holds the lease and can reach the database", async () => {
    await loop().pass();

    const response = await injectJson(server(), { method: "GET", url: "/readyz" });

    expect(response.result).toEqual({ status: "ready" });
  });
});

describe("GET /version", () => {
  it("returns a schema version", async () => {
    const response = await injectJson<{ schemaVersion: number }>(server(), { method: "GET", url: "/version" });

    expect(response.result.schemaVersion).toBe(1);
  });
});
