import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, testDatabaseUrl } from "@floor/store";
import { buildDeps } from "../deps.js";
import { buildServer } from "../server.js";
import { VISIT_TOKEN_SECRET, setupTestServer } from "../test-server.js";
import { mintVisitToken } from "../visit-token.js";
import { workStarted } from "../test-fixtures.js";
import { FIXED_NOW, caughtUpOn, typesOf, watch } from "./live-fixtures.js";

const { server, deps, pool } = setupTestServer();

const DEADLINE = new Date("2026-01-01T01:00:00Z");
const NOBODY = "11111111-2222-3333-4444-555555555555";
const TURN = { kind: "turn" as const, body: { said: "looking" }, occurredAt: FIXED_NOW };

beforeAll(async () => {
  await server().start();
});

describe("GET /assembly-runs/:id/live, refused", () => {
  it("closes with 4401 for a caller with no token", async () => {
    const { runId } = await workStarted(deps());

    expect(await watch({ floor: server(), runId, token: "" }).closed).toBe(4401);
  });

  it("closes with 4401 for a visit's own token: a pod does not watch runs", async () => {
    const { runId, visitId } = await workStarted(deps());
    const token = mintVisitToken(visitId, DEADLINE, VISIT_TOKEN_SECRET);

    expect(await watch({ floor: server(), runId, token }).closed).toBe(4401);
  });

  it("closes with 4404 for a run that does not exist", async () => {
    expect(await watch({ floor: server(), runId: NOBODY }).closed).toBe(4404);
  });

  it("closes with 4404 for a run id that is no uuid", async () => {
    expect(await watch({ floor: server(), runId: "latest" }).closed).toBe(4404);
  });

  it("closes with 4400 for after=last", async () => {
    const { runId } = await workStarted(deps());

    expect(await watch({ floor: server(), runId, after: "last" }).closed).toBe(4400);
  });
});

describe("GET /assembly-runs/:id/live, watched", () => {
  it("replays a run from its start, and says when it has caught up", async () => {
    const { runId, visitId } = await workStarted(deps());

    await deps().records.append(visitId, [TURN]);
    const watched = watch({ floor: server(), runId });

    await watched.told("caught_up");
    watched.socket.close();

    expect(typesOf(watched)).toEqual(["1 visit_opened", "2 record", "2 caught_up"]);
  });

  it("replays only what came after seq 1 for a viewer that has seen 1", async () => {
    const { runId, visitId } = await workStarted(deps());

    await deps().records.append(visitId, [TURN]);
    const watched = watch({ floor: server(), runId, after: "1" });

    await watched.told("caught_up");
    watched.socket.close();

    expect(typesOf(watched)).toEqual(["2 record", "2 caught_up"]);
  });

  it("sends a turn said after the viewer caught up, with the node it was said at", async () => {
    const { visitId, watched } = await caughtUpOn(server(), deps());

    await deps().records.append(visitId, [TURN]);
    const record = await watched.told("record");

    watched.socket.close();

    expect(record).toMatchObject({ seq: 2, visitId, nodeId: "work", iteration: 1, record: { kind: "turn", seq: 1, body: { said: "looking" } } });
  });

  it("sends a visit's report", async () => {
    const { visitId, watched } = await caughtUpOn(server(), deps());

    await deps().runs.report(visitId, { outcome: "failed", error: "lint failed" });
    const reported = await watched.told("visit_reported");

    watched.socket.close();

    expect(reported).toMatchObject({ visit: { id: visitId, report: { outcome: "failed", error: "lint failed" } } });
  });

  it("sends the run's settling last", async () => {
    const { runId, watched } = await caughtUpOn(server(), deps());

    await deps().runs.cancel(runId, "no longer wanted");
    await watched.closed;

    expect(watched.frames.at(-1)).toMatchObject({ type: "run_settled", run: { id: runId, outcome: "cancelled" } });
  });

  it("closes with 1000 once the run has settled", async () => {
    const { runId, watched } = await caughtUpOn(server(), deps());

    await deps().runs.cancel(runId, "no longer wanted");

    expect(await watched.closed).toBe(1000);
  });

  it("replays a run that settled before it was watched, and closes with 1000", async () => {
    const { runId } = await workStarted(deps());

    await deps().runs.cancel(runId, "no longer wanted");

    expect(await watch({ floor: server(), runId }).closed).toBe(1000);
  });

  it("closes with 1000 for a run that settled before it had a journal", async () => {
    const { runId } = await workStarted(deps());

    await deps().runs.cancel(runId, "no longer wanted");
    await pool().query(`delete from run_feed where run_id = $1`, [runId]);

    expect(await watch({ floor: server(), runId }).closed).toBe(1000);
  });

  it("answers unsupported to whatever a viewer says", async () => {
    const { watched } = await caughtUpOn(server(), deps());

    watched.socket.send(JSON.stringify({ type: "input", text: "stop" }));
    const answer = await watched.told("unsupported");

    watched.socket.close();

    expect(answer).toEqual({ type: "unsupported" });
  });

  it("tells a viewer nothing of another run", async () => {
    const { visitId, watched } = await caughtUpOn(server(), deps());
    const { run } = await deps().runs.start({ lineId: "line", repo: "other", startItems: {} });

    await deps().runs.openVisit(run.id, "work", 1);
    await deps().records.append(visitId, [TURN]);
    await watched.told("record");
    watched.socket.close();

    expect(typesOf(watched)).toEqual(["1 visit_opened", "1 caught_up", "2 record"]);
  });
});

describe("GET /assembly-runs/:id/live, on another replica", () => {
  const otherPool = createPool(testDatabaseUrl());
  const notifiers: { close: () => Promise<void> }[] = [];

  afterAll(async () => {
    await Promise.all(notifiers.map((notifier) => notifier.close()));
    await otherPool.end();
  });

  it("sends a viewer on one floor a turn written through the other", async () => {
    const otherDeps = buildDeps(otherPool, deps().config, () => FIXED_NOW);
    const other = await buildServer(otherDeps, () => false);

    notifiers.push(otherDeps.notifier);

    await other.start();
    const { visitId, watched } = await caughtUpOn(other, deps());

    await deps().records.append(visitId, [TURN]);
    const record = await watched.told("record");

    await other.stop();

    expect(record).toMatchObject({ seq: 2, visitId });
  });
});
