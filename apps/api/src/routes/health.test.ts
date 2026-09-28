import { describe, expect, it } from "vitest";
import { injectJson, setupTestServer } from "../test-server.js";

const { server } = setupTestServer();

describe("GET /healthz", () => {
  it("is reachable with no bearer token", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /readyz", () => {
  it("reports ready once the pool can reach the database", async () => {
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
