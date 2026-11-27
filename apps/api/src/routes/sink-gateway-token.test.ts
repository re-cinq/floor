import { verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { VisitBrief } from "@re-cinq/floor-contracts";
import { FILES_MCP, askDispatched } from "../gateway-fixtures.js";
import { loadGatewayKeys } from "../gateway-keys.js";
import { ed25519TestKey, partsOf } from "../gateway-test-keys.js";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const KEY = ed25519TestKey();
const gatewayKeys = loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: KEY.pem });
const MS_PER_SECOND = 1000;
const NOW_SECONDS = 1_767_225_600;

const { server, deps, loop } = setupTestServer({ gatewayKeys, baseUrl: "https://floor.example.com" });

async function briefOf(visitId: string) {
  return injectJson<VisitBrief>(server(), { method: "GET", url: `/station-runs/${visitId}/brief`, headers: authHeaders() });
}

async function asked(mcpServers?: unknown[]) {
  const { runId, visitId } = await askDispatched({ deps: deps(), loop: loop() }, "GitHub.com/Acme/Widgets", mcpServers);
  const { result } = await briefOf(visitId);

  return { runId, visitId, brief: result };
}

describe("GET /station-runs/:id/brief, for a definition that asks for a gateway token", () => {
  it("carries a token for the server that asks and none for the one that does not", async () => {
    const { brief } = await asked();

    expect(Object.keys(brief.serverTokens ?? {})).toEqual(["search"]);
  });

  it("tells the executor which server asked, and for what", async () => {
    const { brief } = await asked();

    expect(brief).toMatchObject({ settings: { mcpServers: [{ name: "search", visitToken: { audience: "search", scopes: ["context:read", "memory:write"] } }, { name: "files" }] } });
  });

  it("signs the token with the floor's key", async () => {
    const { brief } = await asked();
    const { header, signingInput, signature } = partsOf(brief.serverTokens!.search!);

    expect({ kid: header.kid, verified: verify(null, signingInput, KEY.publicKey, signature) }).toEqual({ kid: gatewayKeys.signing?.kid, verified: true });
  });

  it("names the visit, its run, its repository, the audience and the scopes, until the visit's deadline", async () => {
    const { runId, visitId, brief } = await asked();
    const visit = await deps().runs.visit(visitId);

    expect(partsOf(brief.serverTokens!.search!).claims).toEqual({
      iss: "https://floor.example.com",
      aud: "search",
      sub: visitId,
      run: runId,
      repo: "github.com/acme/widgets",
      scope: "context:read memory:write",
      iat: NOW_SECONDS,
      exp: Math.floor(visit!.deadline!.getTime() / MS_PER_SECOND),
    });
  });

  it("carries no tokens at all for a definition none of whose servers asks", async () => {
    const { brief } = await asked([FILES_MCP]);

    expect(brief.serverTokens).toBeUndefined();
  });

  it("gives no brief for a run with no repository to name", async () => {
    const { visitId } = await askDispatched({ deps: deps(), loop: loop() }, "widgets");
    const response = await briefOf(visitId);

    expect(response.statusCode).toBe(409);
  });
});

describe("a gateway token presented to the floor itself", () => {
  it.each(["/assembly-runs", "/station-runs/{visitId}/brief"])("is answered 401 on GET %s", async (route) => {
    const { visitId, brief } = await asked();
    const response = await injectJson(server(), { method: "GET", url: route.replace("{visitId}", visitId), headers: { authorization: `Bearer ${brief.serverTokens!.search!}` } });

    expect(response.statusCode).toBe(401);
  });
});
