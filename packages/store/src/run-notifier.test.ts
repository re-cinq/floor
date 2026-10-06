import { afterEach, describe, expect, it } from "vitest";
import { setupStoreFixture, startItems, FIXED_NOW } from "./assembly-run-store.fixtures.js";
import { createPool } from "./pg.js";
import { connectionString } from "./pg-test-pool.js";
import { RecordsStore } from "./records.js";
import { LISTENER_NAME, PgRunNotifier, type FloorNotice } from "./run-notifier.js";

const { pool, store, seedReviewLine, openEntryVisit } = setupStoreFixture();

const SOON_MS = 20;
const PATIENCE_MS = 5000;

let notifier: PgRunNotifier;

afterEach(async () => {
  await notifier.close();
});

interface Heard {
  changed: Promise<string>;
  resynced: Promise<string>;
}

interface Pending<Told> {
  told: Promise<Told>;
  tell: (told: Told) => void;
}

function awaiting<Told>(): Pending<Told> {
  let tell = (told: Told): void => void told;
  const told = new Promise<Told>((resolve) => (tell = resolve));

  return { told, tell };
}

async function listeningTo(runId: string): Promise<Heard> {
  const changed = awaiting<string>();
  const resynced = awaiting<string>();

  notifier = new PgRunNotifier({ connectionString, retryMs: SOON_MS });
  await notifier.subscribe(runId, { changed: () => changed.tell("changed"), resync: () => resynced.tell("resync") });

  return { changed: changed.told, resynced: resynced.told };
}

async function killListener(): Promise<void> {
  await pool().query(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = $1`, [LISTENER_NAME]);
}

function within<Told>(told: Promise<Told>): Promise<Told | string> {
  return Promise.race([told, new Promise<string>((resolve) => setTimeout(() => resolve("nothing"), PATIENCE_MS))]);
}

describe("the run notifier", () => {
  it("tells a subscriber of a record written through another pool", async () => {
    const { runId, visitId } = await openEntryVisit();
    const heard = await listeningTo(runId);
    const elsewhere = createPool(connectionString);

    await new RecordsStore({ pool: elsewhere }).append(visitId, [{ kind: "turn", body: {}, occurredAt: FIXED_NOW }]);
    await elsewhere.end();

    expect(await within(heard.changed)).toBe("changed");
  });

  it("tells a subscriber nothing of another run", async () => {
    const watched = await openEntryVisit();
    const heard = await listeningTo("11111111-2222-3333-4444-555555555555");

    await new RecordsStore({ pool: pool() }).append(watched.visitId, [{ kind: "turn", body: {}, occurredAt: FIXED_NOW }]);
    const said = await Promise.race([heard.changed, new Promise<string>((resolve) => setTimeout(() => resolve("nothing"), SOON_MS))]);

    expect(said).toBe("nothing");
  });

  it("tells a subscriber to resync once it listens again, its connection having been killed", async () => {
    const { runId } = await openEntryVisit();
    const heard = await listeningTo(runId);

    await killListener();

    expect(await within(heard.resynced)).toBe("resync");
  });

  it("tells nobody once a subscriber has stopped", async () => {
    const { runId, visitId } = await openEntryVisit();
    let told = "nothing";

    notifier = new PgRunNotifier({ connectionString });
    const stop = await notifier.subscribe(runId, { changed: () => (told = "changed"), resync: () => (told = "resync") });

    stop();
    await new RecordsStore({ pool: pool() }).append(visitId, [{ kind: "turn", body: {}, occurredAt: FIXED_NOW }]);
    await new Promise((resolve) => setTimeout(resolve, SOON_MS));

    expect(told).toBe("nothing");
  });
});

describe("the run notifier, floor-wide", () => {
  it("tells a floor listener of a run started, by its id and the kind run_started", async () => {
    await seedReviewLine();
    const started = awaiting<FloorNotice>();

    notifier = new PgRunNotifier({ connectionString, retryMs: SOON_MS });
    await notifier.subscribeFloor({ told: (notice) => notice.kind === "run_started" && started.tell(notice), resync: () => undefined });
    const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

    expect(await within(started.told)).toEqual({ run: run.id, kind: "run_started" });
  });

  it("tells a floor listener of a run reopened, by its id and the kind run_reopened", async () => {
    const { runId } = await openEntryVisit();
    const reopened = awaiting<FloorNotice>();

    await store().cancel(runId, "not needed");
    notifier = new PgRunNotifier({ connectionString, retryMs: SOON_MS });
    await notifier.subscribeFloor({ told: (notice) => notice.kind === "run_reopened" && reopened.tell(notice), resync: () => undefined });
    await store().openVisitByHand(runId, "review", "ana");

    expect(await within(reopened.told)).toEqual({ run: runId, kind: "run_reopened" });
  });

  it("tells a floor listener to resync once its lost connection is back", async () => {
    const resynced = awaiting<string>();

    notifier = new PgRunNotifier({ connectionString, retryMs: SOON_MS });
    await notifier.subscribeFloor({ told: () => undefined, resync: () => resynced.tell("resync") });

    await killListener();

    expect(await within(resynced.told)).toBe("resync");
  });
});
