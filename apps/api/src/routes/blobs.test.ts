import { describe, expect, it } from "vitest";
import type { LineBody, StationBody } from "@floor/store";
import { VISIT_TOKEN_SECRET, authHeaders, injectJson, setupTestServer } from "../test-server.js";
import { mintVisitToken } from "../visit-token.js";

const { server, deps } = setupTestServer();

interface PutBlobResult {
  hash: string;
  size: number;
}

const DEADLINE = new Date("2026-01-01T01:00:00Z");

describe("GET /blobs/:hash, with a visit's token", () => {
  const STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [{ name: "spec", kind: "file" }], produces: [] };
  const LINE: LineBody = { entry: "work", exit: "done", args: {}, nodes: [{ id: "work", station: "reader" }, { id: "done" }], edges: [{ from: "work", to: "done", on: "success" }] };

  async function visitGiven(contents: string) {
    const given = await deps().blobs.put(Buffer.from(contents));
    const other = await deps().blobs.put(Buffer.from("another run's secret"));

    await deps().definitions.put("station", "reader", STATION);
    await deps().definitions.put("line", "reading", LINE);
    const { run } = await deps().runs.start({ lineId: "reading", repo: "r", startItems: { spec: { kind: "file", ref: given.hash, by: "start" } } });
    const { visit } = await deps().runs.openVisit(run.id, "work", 1);
    const token = mintVisitToken(visit.id, DEADLINE, VISIT_TOKEN_SECRET);

    return { visitId: visit.id, given: given.hash, other: other.hash, headers: { authorization: `Bearer ${token}` } };
  }

  it("reads a file the visit was given", async () => {
    const visit = await visitGiven("the spec");
    const response = await injectJson(server(), { method: "GET", url: `/blobs/${visit.given}`, headers: visit.headers });

    expect(response.rawPayload.toString()).toBe("the spec");
  });

  it("stolen token: a blob the visit was not given does not exist, as far as it is told", async () => {
    const visit = await visitGiven("the spec");
    const response = await injectJson(server(), { method: "GET", url: `/blobs/${visit.other}`, headers: visit.headers });

    expect(response.statusCode).toBe(404);
  });

  it("reads a file the visit has itself uploaded", async () => {
    const visit = await visitGiven("the spec");

    await deps().records.append(visit.visitId, [{ kind: "produced", body: { name: "note", ref: visit.other }, occurredAt: DEADLINE }]);
    const response = await injectJson(server(), { method: "GET", url: `/blobs/${visit.other}`, headers: visit.headers });

    expect(response.statusCode).toBe(200);
  });
});

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
