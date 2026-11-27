import { describe, expect, it } from "vitest";
import { gatewayTokenKey, gatewayTokenKeys } from "./gateway-token-keys.js";

const ASKS = { audience: "search", scopes: ["context:read"] };

function server(name: string) {
  return { name, transport: "http" as const, url: `http://${name}.test/mcp`, visitToken: ASKS };
}

function keepingItsOwnSecret(name: string) {
  return { name, transport: "http" as const, url: `http://${name}.test/mcp`, headersSecret: `${name}-auth` };
}

describe("gatewayTokenKeys", () => {
  it("gives server search of visit v1 the key visit-v1-gateway-token.search, holding its token as a bearer value", () => {
    const keys = gatewayTokenKeys({ visitId: "v1", servers: [server("search")], serverTokens: { search: "jwt-search" } });

    expect(keys).toEqual({ keyOf: { search: "visit-v1-gateway-token.search" }, entries: { "visit-v1-gateway-token.search": "Bearer jwt-search" } });
  });

  it("gives a key to each of two servers that ask", () => {
    const keys = gatewayTokenKeys({ visitId: "v1", servers: [server("search"), server("lore")], serverTokens: { search: "jwt-search", lore: "jwt-lore" } });

    expect(keys.entries).toEqual({ "visit-v1-gateway-token.search": "Bearer jwt-search", "visit-v1-gateway-token.lore": "Bearer jwt-lore" });
  });

  it("gives no key to a server that keeps its own secret, nor to a visit with no servers", () => {
    const empty = { keyOf: {}, entries: {} };

    expect([gatewayTokenKeys({ visitId: "v1", servers: [keepingItsOwnSecret("lore")], serverTokens: undefined }), gatewayTokenKeys({ visitId: "v1", servers: undefined, serverTokens: undefined })]).toEqual([empty, empty]);
  });

  it("names a key a Secret takes for a server whose name it would not", () => {
    expect(gatewayTokenKey("v1", "my search/2")).toBe("visit-v1-gateway-token.my_search_2");
  });

  it.each([
    ["one key", "my search", "my_search"],
    ["one pod variable", "my-search", "my_search"],
    ["one pod variable by case", "Search", "search"],
  ])("refuses two servers whose tokens would share %s, naming both", (described, first, second) => {
    const ask = { visitId: "v1", servers: [server(first), server(second)], serverTokens: { [first]: "jwt-1", [second]: "jwt-2" } };

    expect(() => gatewayTokenKeys(ask)).toThrow(`MCP servers "${first}" and "${second}" both ask for a gateway token, and their names are too alike to keep the two tokens apart: rename one`);
  });

  it.each([
    ["no tokens", undefined],
    ["a token for another server only", { lore: "jwt-lore" }],
    ["an empty token", { search: "" }],
  ])("refuses a server that asks when the brief carries %s, naming the server", (described, serverTokens) => {
    const ask = { visitId: "v1", servers: [server("search")], serverTokens };

    expect(() => gatewayTokenKeys(ask)).toThrow('MCP server "search" asks for a gateway token, and the brief of station run "v1" carries none for it, so no pod is started');
  });
});
