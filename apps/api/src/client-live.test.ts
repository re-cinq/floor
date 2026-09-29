import { beforeAll, describe, expect, it } from "vitest";
import { createFloorClient, serviceToken, type LiveFrame } from "@re-cinq/floor-client";
import { SERVICE_TOKEN, setupTestServer } from "./test-server.js";
import { workStarted } from "./test-fixtures.js";
import { FIXED_NOW } from "./live/live-fixtures.js";

const { server, deps } = setupTestServer();

const TURN = { kind: "turn" as const, body: { said: "looking" }, occurredAt: FIXED_NOW };

beforeAll(async () => {
  await server().start();
});

function client() {
  return createFloorClient({ url: `http://localhost:${server().info.port}`, token: serviceToken(SERVICE_TOKEN) });
}

async function framesUntil(runId: string, wanted: LiveFrame["type"], limit = 10): Promise<LiveFrame[]> {
  const watch = client().runs.watch(runId);
  const seen: LiveFrame[] = [];

  for await (const frame of watch) {
    seen.push(frame);
    if (frame.type === wanted || seen.length >= limit) break;
  }

  watch.stop();

  return seen;
}

describe("the published client against a floor that is really listening", () => {
  it("reads a run back over HTTP, with the bag it was started with", async () => {
    const { runId } = await workStarted(deps());
    const read = await client().runs.get(runId);

    expect(read?.run.id).toBe(runId);
  });

  it("answers null for a run that is not there, rather than throwing", async () => {
    expect(await client().runs.get("11111111-2222-3333-4444-555555555555")).toBeNull();
  });

  it("carries the service token on the upgrade, which is the only way the floor sees it", async () => {
    const { runId } = await workStarted(deps());
    const seen = await framesUntil(runId, "caught_up");

    expect(seen.at(-1)?.type).toBe("caught_up");
  });

  it("is handed a record as it happens, after it has caught up", async () => {
    const { runId, visitId } = await workStarted(deps());
    const watch = client().runs.watch(runId);
    const seen: LiveFrame[] = [];

    for await (const frame of watch) {
      seen.push(frame);
      if (frame.type === "caught_up") await deps().records.append(visitId, [TURN]);
      if (frame.type === "record") break;
    }

    watch.stop();

    expect(seen.at(-1)).toMatchObject({ type: "record", visitId, record: { kind: "turn" } });
  });

  it("ends as settled, and stops watching, once the run settles", async () => {
    const { runId, visitId } = await workStarted(deps());
    const watch = client().runs.watch(runId);

    await deps().runs.report(visitId, { outcome: "success" });

    for await (const frame of watch) if (frame.type === "run_settled") break;

    expect(await watch.ended).toEqual({ reason: "settled" });
  });

  it("refuses a run nobody has, and does not come back for it", async () => {
    const watch = client().runs.watch("11111111-2222-3333-4444-555555555555");

    expect(await watch.ended).toMatchObject({ reason: "refused", code: 4404 });
  });
});
