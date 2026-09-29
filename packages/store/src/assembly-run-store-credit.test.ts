import { describe, expect, it } from "vitest";
import type { FloorEvent } from "./events.js";
import { FIXED_NOW, setupStoreFixture } from "./assembly-run-store.fixtures.js";

const { store, events, openEntryVisit } = setupStoreFixture();

const FIVE_MINUTES_MS = 5 * 60_000;
const AN_HOUR_MS = 60 * 60_000;
const OUT_OF_CREDIT = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";

function enqueueDispatch(tags: string[], availableAt?: Date): Promise<FloorEvent> {
  return events().enqueue({ name: "station_run.dispatch", payload: {}, tags, availableAt });
}

async function claimEveryDispatch(): Promise<void> {
  await events().claim({ names: ["station_run.dispatch"], limit: 100, claimedBy: "cluster-agent" });
}

async function dispatchTimeAfterFailing(error: string, pendingTags: string[]): Promise<Date> {
  const { visitId } = await openEntryVisit();

  await claimEveryDispatch();
  const pending = await enqueueDispatch(pendingTags);

  await store().report(visitId, { outcome: "failed", error });

  return (await events().get(pending.id))!.availableAt;
}

describe("AssemblyRunStore.report with a provider out of credit", () => {
  it("pushes a pending agent dispatch's not_before five minutes past now", async () => {
    const heldUntil = await dispatchTimeAfterFailing(OUT_OF_CREDIT, ["kind:agent", "team:a"]);

    expect(heldUntil).toEqual(new Date(FIXED_NOW.getTime() + FIVE_MINUTES_MS));
  });

  it("leaves a pending agent dispatch alone when the error is 'lint failed'", async () => {
    const heldUntil = await dispatchTimeAfterFailing("lint failed", ["kind:agent"]);

    expect(heldUntil).toEqual(FIXED_NOW);
  });

  it("leaves a pending service dispatch alone", async () => {
    const heldUntil = await dispatchTimeAfterFailing(OUT_OF_CREDIT, ["station:lint"]);

    expect(heldUntil).toEqual(FIXED_NOW);
  });

  it("makes a pushed dispatch unclaimable now", async () => {
    await dispatchTimeAfterFailing(OUT_OF_CREDIT, ["kind:agent"]);
    const claimed = await events().claim({ names: ["station_run.dispatch"], limit: 100, claimedBy: "cluster-agent" });

    expect(claimed).toEqual([]);
  });

  it("leaves a dispatch a worker already claimed alone", async () => {
    const { visitId } = await openEntryVisit();
    const claimedByWorker = await enqueueDispatch(["kind:agent"]);

    await claimEveryDispatch();
    await store().report(visitId, { outcome: "failed", error: OUT_OF_CREDIT });

    expect((await events().get(claimedByWorker.id))!.availableAt).toEqual(FIXED_NOW);
  });

  it("keeps a not_before already later than five minutes", async () => {
    const { visitId } = await openEntryVisit();
    const inAnHour = new Date(FIXED_NOW.getTime() + AN_HOUR_MS);
    const backedOff = await enqueueDispatch(["kind:agent"], inAnHour);

    await claimEveryDispatch();
    await store().report(visitId, { outcome: "failed", error: OUT_OF_CREDIT });

    expect((await events().get(backedOff.id))!.availableAt).toEqual(inAnHour);
  });
});
