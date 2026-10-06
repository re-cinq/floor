import { beforeAll, describe, expect, it, vi } from "vitest";
import { VISIT_TOKEN_SECRET, setupTestServer } from "../test-server.js";
import { mintVisitToken } from "../visit-token.js";
import { workStarted } from "../test-fixtures.js";
import { FIXED_NOW, listeningToFloor, watchFloor, type Watched } from "./live-fixtures.js";

const { server, deps } = setupTestServer();

const DEADLINE = new Date("2026-01-01T01:00:00Z");
const TURN = { kind: "turn" as const, body: { said: "looking" }, occurredAt: FIXED_NOW };

function typesToldOf(watched: Watched, runId: string): string[] {
  const ofRun = watched.frames.filter((frame) => frame.runId === runId);

  return ofRun.map((frame) => frame.type);
}

beforeAll(async () => {
  await server().start();
});

describe("GET /assembly-runs/live, refused", () => {
  it("closes with 4401 for a caller with no token", async () => {
    expect(await watchFloor({ floor: server(), token: "" }).closed).toBe(4401);
  });

  it("closes with 4401 for a visit's own token: a pod does not watch the floor", async () => {
    const { visitId } = await workStarted(deps());
    const token = mintVisitToken(visitId, DEADLINE, VISIT_TOKEN_SECRET);

    expect(await watchFloor({ floor: server(), token }).closed).toBe(4401);
  });
});

describe("GET /assembly-runs/live, watched", () => {
  it("tells a viewer of a run started after it connected, by the run's id", async () => {
    const watched = await listeningToFloor(server());
    const { runId } = await workStarted(deps());

    expect(await watched.told("run_started")).toEqual({ type: "run_started", runId });
    watched.socket.close();
  });

  it("tells a viewer a run changed when its visit is opened, when it is reported and when the run settles, and nothing of a record written", async () => {
    const watched = await listeningToFloor(server());
    const { runId, visitId } = await workStarted(deps());

    await deps().records.append(visitId, [TURN]);
    await deps().runs.report(visitId, { outcome: "failed", error: "lint failed" });

    await vi.waitFor(() => expect(typesToldOf(watched, runId)).toEqual(["run_started", "run_changed", "run_changed", "run_changed"]));
    watched.socket.close();
  });

  it("tells a viewer a run changed when a start by hand reopens it", async () => {
    const { runId } = await workStarted(deps());

    await deps().runs.cancel(runId, "not needed");
    const watched = await listeningToFloor(server());

    await deps().runs.openVisitByHand(runId, "work", "ana");

    await vi.waitFor(() => expect(typesToldOf(watched, runId)).toEqual(["run_changed", "run_changed", "run_changed"]));
    watched.socket.close();
  });
});
