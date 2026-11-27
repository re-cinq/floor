import { describe, expect, it } from "vitest";
import { injectJson, setupTestServer } from "../test-server.js";

const { server } = setupTestServer();

describe("GET /.well-known/jwks.json on a floor with no gateway keys", () => {
  it("answers an empty key set", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/.well-known/jwks.json" });

    expect({ statusCode: response.statusCode, result: response.result }).toEqual({ statusCode: 200, result: { keys: [] } });
  });
});
