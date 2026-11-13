import { describe, expect, it } from "vitest";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

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

  it("returns schema version 8, the count of the store's migrations", async () => {
    const response = await injectJson<{ schemaVersion: number }>(server(), { method: "GET", url: "/version" });

    expect(response.result.schemaVersion).toBe(8);
  });

  it("lists east with the build and subsystem it registered", async () => {
    const subsystem = { version: "0.19.0", clis: { claude: "2.1.311", codex: "0.167.1", gemini: "0.62.0", opencode: "1.2.0" } };

    await pool().query("truncate clusters cascade");
    await server().inject({ method: "PUT", url: "/clusters/east", headers: authHeaders(), payload: { tags: ["kind:agent"], build: "abc123", subsystem } });
    const response = await injectJson<{ clusters: unknown[] }>(server(), { method: "GET", url: "/version" });

    expect(response.result.clusters).toEqual([{ id: "east", build: "abc123", subsystem, lastSeenAt: expect.any(Date) }]);
  });
});
