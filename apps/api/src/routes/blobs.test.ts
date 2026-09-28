import { describe, expect, it } from "vitest";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server } = setupTestServer();

interface PutBlobResult {
  hash: string;
  size: number;
}

describe("POST /blobs", () => {
  it("stores the bytes and returns their hash", async () => {
    const response = await injectJson<PutBlobResult>(server(), { method: "POST", url: "/blobs", headers: authHeaders(), payload: Buffer.from("hello") });

    expect({ statusCode: response.statusCode, size: response.result.size }).toEqual({ statusCode: 201, size: 5 });
  });
});

describe("GET /blobs/:hash", () => {
  it("returns the stored bytes", async () => {
    const put = await injectJson<PutBlobResult>(server(), { method: "POST", url: "/blobs", headers: authHeaders(), payload: Buffer.from("hello") });

    const response = await injectJson(server(), { method: "GET", url: `/blobs/${put.result.hash}`, headers: authHeaders() });

    expect(response.rawPayload.toString()).toBe("hello");
  });

  it("returns 404 for a hash never put", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/blobs/sha256-nonexistent", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});
