import { afterAll, describe, expect, it } from "vitest";
import { startFakeGitProvider } from "../fake-git-provider.js";
import { fixDispatched } from "../git-fixtures.js";
import { SERVICE_TOKEN, VISIT_TOKEN_SECRET, injectJson, setupTestServer } from "../test-server.js";
import { mintVisitToken } from "../visit-token.js";

const provider = await startFakeGitProvider();
const { server, deps, loop } = setupTestServer({ gitCredentialUrl: provider.url });

afterAll(async () => {
  await provider.close();
});

const DEADLINE = new Date("2026-01-01T01:00:00Z");
const SOMEONE_ELSE = "11111111-2222-3333-4444-555555555555";

interface Asking {
  repo?: string;
  startedOn?: string;
  tokenOf?: string;
}

async function ask(asking: Asking = {}) {
  const visitId = await fixDispatched({ deps: deps(), loop: loop() }, asking.startedOn ?? "github.com/re-cinq/floor");
  const token = mintVisitToken(asking.tokenOf ?? visitId, DEADLINE, VISIT_TOKEN_SECRET);

  return injectJson<{ username: string; password: string }>(server(), {
    method: "POST",
    url: `/station-runs/${visitId}/git-credential`,
    headers: { authorization: `Bearer ${token}` },
    payload: { repo: asking.repo ?? "re-cinq/floor" },
  });
}

describe("POST /station-runs/:id/git-credential", () => {
  it("answers re-cinq/floor with the pair git's credential helper reads", async () => {
    const response = await ask();

    expect(response.result).toEqual({ username: "x-access-token", password: "ghs_write" });
  });

  it("asks the provider as a service, for the clone url and the access the need declares", async () => {
    await ask();

    expect(provider.asked.at(-1)).toEqual({ authorization: `Bearer ${SERVICE_TOKEN}`, repoUrl: "https://github.com/re-cinq/floor", access: "write" });
  });

  it("other repository: refuses re-cinq/lore, which the visit was not given", async () => {
    const response = await ask({ repo: "re-cinq/lore" });

    expect(response.statusCode).toBe(403);
  });

  it("other repository: never asks the provider about it", async () => {
    const before = provider.asked.length;

    await ask({ repo: "re-cinq/lore" });

    expect(provider.asked.length).toBe(before);
  });

  it("stolen token: refuses another visit's token", async () => {
    const response = await ask({ tokenOf: SOMEONE_ELSE });

    expect(response.statusCode).toBe(403);
  });

  it("answers 502 when the provider refuses the repository", async () => {
    const response = await ask({ startedOn: "github.com/re-cinq/refused", repo: "re-cinq/refused" });

    expect(response.statusCode).toBe(502);
  });

  it("answers 400 to a request naming no repository", async () => {
    const visitId = await fixDispatched({ deps: deps(), loop: loop() }, "github.com/re-cinq/floor");
    const headers = { authorization: `Bearer ${mintVisitToken(visitId, DEADLINE, VISIT_TOKEN_SECRET)}` };
    const response = await injectJson(server(), { method: "POST", url: `/station-runs/${visitId}/git-credential`, headers, payload: {} });

    expect(response.statusCode).toBe(400);
  });

  it("answers 409 for a visit that has reported", async () => {
    const visitId = await fixDispatched({ deps: deps(), loop: loop() }, "github.com/re-cinq/floor");
    const headers = { authorization: `Bearer ${mintVisitToken(visitId, DEADLINE, VISIT_TOKEN_SECRET)}` };

    await deps().runs.report(visitId, { outcome: "success" });
    const response = await injectJson(server(), { method: "POST", url: `/station-runs/${visitId}/git-credential`, headers, payload: { repo: "re-cinq/floor" } });

    expect(response.statusCode).toBe(409);
  });
});
