import { describe, expect, it } from "vitest";
import { dispatchSettings } from "./agent-config.js";

const SETTINGS = { prompt: "p", image: "img:1", timeoutMinutes: 5 };

describe("dispatchSettings", () => {
  it("carries an http server's X-API-Key header and the secret key it reads", () => {
    const search = { name: "search", transport: "http", url: "http://search.test/mcp", headers: [{ name: "X-API-Key", ref: "search-api-key" }] };

    expect(dispatchSettings({ ...SETTINGS, config: { mcp_servers: [search] } }).mcpServers).toEqual([search]);
  });

  it("carries a stdio server's API_KEY env var and the secret key it reads", () => {
    const files = { name: "files", transport: "stdio", command: "npx", args: ["-y", "files-mcp"], env: [{ name: "API_KEY", ref: "files-api-key" }] };

    expect(dispatchSettings({ ...SETTINGS, config: { mcp_servers: [files] } }).mcpServers).toEqual([files]);
  });

  it("refuses a header with no secret key, naming it", () => {
    const search = { name: "search", transport: "http", url: "http://search.test/mcp", headers: [{ name: "X-API-Key" }] };

    expect(() => dispatchSettings({ ...SETTINGS, config: { mcp_servers: [search] } })).toThrow(/mcp_servers\.0\.headers\.0\.ref/);
  });
});
