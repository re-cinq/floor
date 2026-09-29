import { beforeAll, describe, expect, it } from "vitest";
import { setupTestServer } from "../test-server.js";
import { workStarted } from "../test-fixtures.js";
import { FIXED_NOW, caughtUpOn, watch } from "./live-fixtures.js";

const ONE_KILOBYTE = 1024;
const { server, deps } = setupTestServer({ live: { viewersPerRun: 2, bufferedBytes: ONE_KILOBYTE } });

const ABNORMAL = 1006;
const LONG_TURN = { kind: "turn" as const, body: { said: "word ".repeat(12_000) }, occurredAt: FIXED_NOW };
const FIFTY_LONG_TURNS = Array.from({ length: 50 }, () => LONG_TURN);

beforeAll(async () => {
  await server().start();
});

describe("GET /assembly-runs/:id/live, within limits", () => {
  it("closes with 4429 for a third viewer of a run that may have 2", async () => {
    const { runId } = await workStarted(deps());
    const viewers = [watch({ floor: server(), runId }), watch({ floor: server(), runId })];

    await Promise.all(viewers.map((viewer) => viewer.told("caught_up")));
    const third = await watch({ floor: server(), runId }).closed;

    viewers.forEach((viewer) => viewer.socket.close());

    expect(third).toBe(4429);
  });

  it("takes a viewer again once another of the run's 2 has left", async () => {
    const { runId } = await workStarted(deps());
    const [first, second] = [watch({ floor: server(), runId }), watch({ floor: server(), runId })];

    await Promise.all([first.told("caught_up"), second.told("caught_up")]);
    first.socket.close();
    await first.closed;
    const third = watch({ floor: server(), runId });
    const caughtUp = await third.told("caught_up");

    [second, third].forEach((viewer) => viewer.socket.close());

    expect(caughtUp).toEqual({ type: "caught_up", seq: 1 });
  });

  it("drops a viewer that reads nothing while its run says 400 long turns", async () => {
    const { visitId, watched } = await caughtUpOn(server(), deps());

    watched.socket.pause();
    for (let batch = 0; batch < 8; batch++) await deps().records.append(visitId, FIFTY_LONG_TURNS);
    watched.socket.resume();

    expect(await watched.closed).toBe(ABNORMAL);
  });
});
