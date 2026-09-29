import { describe, expect, it } from "vitest";
import { createStoppable } from "./stoppable.js";

const SHORT_DELAY_MS = 20;
const LONG_DELAY_MS = 60_000;

describe("createStoppable", () => {
  it("is running until it is told to stop", () => {
    const stoppable = createStoppable();
    const beforeStop = stoppable.running();

    stoppable.stop();

    expect({ beforeStop, afterStop: stoppable.running() }).toEqual({ beforeStop: true, afterStop: false });
  });

  it("wakes a sleeping loop the moment it is told to stop", async () => {
    const stoppable = createStoppable();
    const sleeping = stoppable.sleep(LONG_DELAY_MS);

    stoppable.stop();

    await expect(sleeping).resolves.toBeUndefined();
  });

  it("sleeps the whole delay when nobody stops it", async () => {
    const stoppable = createStoppable();

    await stoppable.sleep(SHORT_DELAY_MS);

    expect(stoppable.running()).toBe(true);
  });
});
