import { describe, expect, it } from "vitest";
import type { Server } from "@hapi/hapi";
import { workStarted } from "./test-fixtures.js";
import { SERVICE_TOKEN, VISIT_TOKEN_SECRET, setupTestServer } from "./test-server.js";
import { mintVisitToken } from "./visit-token.js";

const { server, deps } = setupTestServer();

const DEADLINE = new Date("2026-01-01T01:00:00Z");
const OUT_OF_SCOPE = 403;
const NAMELESS = 401;

const OPEN_TO_A_VISIT = [
  "GET /blobs/{hash}",
  "GET /conversations/{id}",
  "GET /station-runs/{id}/brief",
  "GET /station-runs/{id}/records",
  "POST /blobs",
  "POST /conversations/{id}",
  "POST /events",
  "POST /station-runs/{id}/git-credential",
  "POST /station-runs/{id}/records",
  "POST /station-runs/{id}/sink",
];

async function openVisit(): Promise<string> {
  const { visitId } = await workStarted(deps());

  return visitId;
}

interface Asked {
  route: string;
  status: number;
  answer: string;
}

function guarded(floor: Server) {
  return floor.table().filter((route) => Boolean(route.settings.auth));
}

async function askedOfEveryRoute(token: string, visitId: string): Promise<Asked[]> {
  const routes = guarded(server());

  return Promise.all(
    routes.map(async (route) => {
      const ofTheVisit = route.path.replaceAll("{id}", visitId);
      const url = ofTheVisit.replaceAll(/\{[a-z]+\}/g, "anything");
      const response = await server().inject({ method: route.method, url, headers: { authorization: `Bearer ${token}` } });

      return { route: `${route.method.toUpperCase()} ${route.path}`, status: response.statusCode, answer: response.payload };
    }),
  );
}

function isOutOfScope(asked: Asked): boolean {
  return asked.status === OUT_OF_SCOPE && asked.answer.includes("Insufficient scope");
}

describe("what a visit's token reaches", () => {
  it("reaches the ten routes a visit is given, and no other", async () => {
    const visitId = await openVisit();
    const asked = await askedOfEveryRoute(mintVisitToken(visitId, DEADLINE, VISIT_TOKEN_SECRET), visitId);
    const reached = asked.filter((each) => !isOutOfScope(each)).map((each) => each.route);

    expect(reached.toSorted()).toEqual(OPEN_TO_A_VISIT);
  });

  it("is refused by every other route, however many there come to be", async () => {
    const visitId = await openVisit();
    const asked = await askedOfEveryRoute(mintVisitToken(visitId, DEADLINE, VISIT_TOKEN_SECRET), visitId);

    expect(asked.filter(isOutOfScope).length).toBe(guarded(server()).length - OPEN_TO_A_VISIT.length);
  });

  it("answers a route out of its scope as a problem", async () => {
    const visitId = await openVisit();
    const headers = { authorization: `Bearer ${mintVisitToken(visitId, DEADLINE, VISIT_TOKEN_SECRET)}` };
    const response = await server().inject({ method: "GET", url: "/assembly-lines", headers });

    expect(response.headers["content-type"]).toContain("application/problem+json");
  });
});

describe("what the service token reaches", () => {
  it("is refused by no route", async () => {
    const asked = await askedOfEveryRoute(SERVICE_TOKEN, await openVisit());

    expect(asked.filter((each) => each.status === NAMELESS || isOutOfScope(each))).toEqual([]);
  });
});

describe("a caller with no token", () => {
  it("is answered 401 by every guarded route", async () => {
    const routes = guarded(server());
    const answers = await Promise.all(routes.map((route) => server().inject({ method: route.method, url: route.path.replaceAll(/\{[a-z]+\}/g, "anything") })));

    expect(answers.filter((answer) => answer.statusCode !== NAMELESS)).toEqual([]);
  });

  it("is answered as a problem", async () => {
    const response = await server().inject({ method: "GET", url: "/assembly-lines" });

    expect(response.headers["content-type"]).toContain("application/problem+json");
  });
});
