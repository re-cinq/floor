import { describe, expect, it } from "vitest";
import { createFloorClient } from "./client.js";
import { isFloorProblem } from "./problem.js";
import { serviceToken } from "./tokens.js";

const TOKEN = serviceToken("service-token");

interface Asked {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function floorAnswering(answers: { status: number; body?: unknown; contentType?: string }[], url = "http://floor.test/") {
  const { asked, fetchFn } = answering(answers);

  return { asked, client: createFloorClient({ url, token: TOKEN, fetchFn }) };
}

function answering(answers: { status: number; body?: unknown; contentType?: string }[]): { asked: Asked[]; fetchFn: typeof fetch } {
  const asked: Asked[] = [];
  let turn = 0;

  const fetchFn = (async (url: string | URL, init: RequestInit = {}) => {
    asked.push({ url: String(url), method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: (init.body as string | undefined) ?? null });
    const answer = answers[Math.min(turn, answers.length - 1)]!;

    turn += 1;

    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": answer.contentType ?? "application/json" },
    });
  }) as unknown as typeof fetch;

  return { asked, fetchFn };
}

describe("a request the client sends", () => {
  it("carries the service token as a bearer and trims the url's trailing slash", async () => {
    const { asked, client } = floorAnswering([{ status: 200, body: { items: [] } }]);

    await client.stations.list();

    expect(asked[0]).toMatchObject({ url: "http://floor.test/stations", method: "GET", headers: { authorization: "Bearer service-token" } });
  });

  it("sends no content-type when there is no body", async () => {
    const { asked, client } = floorAnswering([{ status: 204 }]);

    await client.events.ack("event-1");

    const headers = asked[0]?.headers ?? {};

    expect(headers["content-type"]).toBeUndefined();
  });

  it("puts a filter in the query string and leaves out what was not given", async () => {
    const { asked, client } = floorAnswering([{ status: 200, body: { items: [], nextCursor: null } }]);

    await client.runs.list({ repo: "github.com/re-cinq/lore", open: true });

    expect(asked[0]?.url).toBe("http://floor.test/assembly-runs?repo=github.com%2Fre-cinq%2Flore&open=true");
  });
});

describe("what the client makes of a refusal", () => {
  it("throws a FloorProblem carrying the status, the title and the per-field errors", async () => {
    const problem = { type: "about:blank", title: "invalid start request", status: 400, detail: "the body did not parse", errors: ["repo is required"] };
    const { client } = floorAnswering([{ status: 400, body: problem, contentType: "application/problem+json" }]);

    await expect(client.lines.start("code-review", { repo: "", startItems: {} })).rejects.toMatchObject({
      status: 400,
      title: "invalid start request",
      errors: ["repo is required"],
      method: "POST",
      path: "/assembly-lines/code-review/start",
    });
  });

  it("makes a problem of an answer that is not problem+json at all", async () => {
    const { client } = floorAnswering([{ status: 502, body: "<html>gateway</html>", contentType: "text/html" }]);
    const listing = client.runs.list({ open: true });
    const refused = await listing.catch((error: unknown) => error);

    expect(isFloorProblem(refused) && refused.status).toBe(502);
  });

  it("answers null for a definition that is not there, rather than throwing", async () => {
    const { client } = floorAnswering([{ status: 404, body: { type: "about:blank", title: "not found", status: 404 }, contentType: "application/problem+json" }]);

    expect(await client.lines.get("missing")).toBeNull();
  });

  it("answers an empty list when the queue has nothing to claim", async () => {
    const { client } = floorAnswering([{ status: 204 }]);

    expect(await client.events.claim({ tags: ["kind:agent"], limit: 5 })).toEqual([]);
  });
});

describe("the brief, whose status is the answer", () => {
  it("is the brief itself when the visit is waiting for one", async () => {
    const brief = { visitId: "visit-1", iteration: 1, floorBaseUrl: "http://floor.test", token: "visit-token", deadlineMinutes: 20, settings: null, needs: [], produces: [], conversation: { mode: "new", save: false } };
    const { client } = floorAnswering([{ status: 200, body: brief }]);

    expect(await client.stationRuns.brief("visit-1")).toMatchObject({ kind: "brief", brief: { visitId: "visit-1" } });
  });

  it("is reported when the visit already has one, so its dispatch is acked and not run", async () => {
    const { client } = floorAnswering([{ status: 409, body: { type: "about:blank", title: "already done", status: 409 }, contentType: "application/problem+json" }]);

    expect(await client.stationRuns.brief("visit-1")).toEqual({ kind: "reported" });
  });

  it("is absent when there is no such visit, so its dispatch is dead-lettered", async () => {
    const { client } = floorAnswering([{ status: 404, body: { type: "about:blank", title: "no station run", status: 404 }, contentType: "application/problem+json" }]);

    expect(await client.stationRuns.brief("visit-1")).toEqual({ kind: "absent" });
  });
});
