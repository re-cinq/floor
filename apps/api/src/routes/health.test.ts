import { describe, expect, it } from "vitest";
import { injectJson, setupTestServer } from "../test-server.js";

const { server, loop, pool } = setupTestServer();

describe("GET /healthz", () => {
  it("is reachable with no bearer token", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /readyz", () => {
  it("is ready without the floor's lease, since serving needs only the database", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/readyz" });

    expect(response.result).toEqual({ status: "ready" });
  });

  it("is ready while every connection of the request pool is taken", async () => {
    const taken = await Promise.all(Array.from({ length: pool().options.max }, () => pool().connect()));

    try {
      const response = await injectJson(server(), { method: "GET", url: "/readyz" });

      expect(response.result).toEqual({ status: "ready" });
    } finally {
      taken.forEach((client) => client.release());
    }
  }, 10_000);
});

describe("GET /version", () => {
  it("says this instance does not run the loop, before it holds the lease", async () => {
    const response = await injectJson<{ runsLoop: boolean }>(server(), { method: "GET", url: "/version" });

    expect(response.result.runsLoop).toBe(false);
  });

  it("says this instance runs the loop, once it holds the lease", async () => {
    await loop().pass();
    const response = await injectJson<{ runsLoop: boolean }>(server(), { method: "GET", url: "/version" });

    expect(response.result.runsLoop).toBe(true);
  });

  it("returns a schema version", async () => {
    const response = await injectJson<{ schemaVersion: number }>(server(), { method: "GET", url: "/version" });

    expect(response.result.schemaVersion).toBe(3);
  });
});
