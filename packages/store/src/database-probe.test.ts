import { describe, expect, it } from "vitest";
import { DatabaseProbe } from "./database-probe.js";
import { testDatabaseUrl } from "./test-database.js";

describe("DatabaseProbe.reachable", () => {
  it("returns true for the test database", async () => {
    const probe = new DatabaseProbe(testDatabaseUrl());

    expect(await probe.reachable()).toBe(true);
    await probe.close();
  });

  it("returns false for a database nobody listens on", async () => {
    const probe = new DatabaseProbe("postgres://postgres@127.0.0.1:1/floor");

    expect(await probe.reachable()).toBe(false);
    await probe.close();
  });
});
