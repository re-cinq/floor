import { describe, expect, it } from "vitest";
import type { Problem } from "@re-cinq/floor-contracts";
import { FILES_MCP, askDispatched } from "../gateway-fixtures.js";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, deps, loop } = setupTestServer();

async function briefFor(mcpServers?: unknown[]) {
  const { visitId } = await askDispatched({ deps: deps(), loop: loop() }, "github.com/acme/widgets", mcpServers);

  return injectJson<Problem>(server(), { method: "GET", url: `/station-runs/${visitId}/brief`, headers: authHeaders() });
}

describe("a floor with no gateway signing key", () => {
  it("gives no brief for a visit whose definition asks for a gateway token, naming the missing key", async () => {
    const response = await briefFor();

    expect({ statusCode: response.statusCode, detail: response.result.detail }).toEqual({
      statusCode: 409,
      detail: `MCP server "search" asks for a gateway token, and this floor has no key to sign one with: set FLOOR_GATEWAY_SIGNING_KEY`,
    });
  });

  it("briefs a visit whose definition asks for none", async () => {
    const response = await briefFor([FILES_MCP]);

    expect(response.statusCode).toBe(200);
  });
});
