import { describe, expect, it } from "vitest";
import { fixDispatched } from "../git-fixtures.js";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, deps, loop } = setupTestServer();

describe("a floor with no git credential provider", () => {
  it("answers 501 to a request for a credential", async () => {
    const visitId = await fixDispatched({ deps: deps(), loop: loop() }, "github.com/re-cinq/floor");
    const response = await injectJson(server(), { method: "POST", url: `/station-runs/${visitId}/git-credential`, headers: authHeaders(), payload: { repo: "re-cinq/floor" } });

    expect(response.statusCode).toBe(501);
  });

  it("gives no brief for a visit that would write to a repository", async () => {
    const visitId = await fixDispatched({ deps: deps(), loop: loop() }, "github.com/re-cinq/floor");
    const response = await injectJson(server(), { method: "GET", url: `/station-runs/${visitId}/brief`, headers: authHeaders() });

    expect(response.statusCode).toBe(409);
  });
});
