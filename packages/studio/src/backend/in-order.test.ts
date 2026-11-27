import { setImmediate as nextMacrotask } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { inOrder } from "./in-order.js";

describe("inOrder", () => {
  it("starts the second task only after the first finished", async () => {
    const events: string[] = [];
    let finishFirst: () => void = () => undefined;
    const firstMayFinish = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const run = inOrder();

    const first = run(async () => {
      events.push("first started");
      await firstMayFinish;
      events.push("first finished");
    });
    const second = run(async () => {
      events.push("second started");
      events.push("second finished");
    });
    await nextMacrotask();
    events.push("first still held");
    finishFirst();
    await Promise.all([first, second]);

    expect(events).toEqual([
      "first started",
      "first still held",
      "first finished",
      "second started",
      "second finished",
    ]);
  });

  it("rejects the failing task and still resolves written for the next one", async () => {
    const run = inOrder();

    const failing = run(() => Promise.reject(new Error("disk full")));
    const next = run(() => Promise.resolve("written"));

    expect(await Promise.allSettled([failing, next])).toEqual([
      { status: "rejected", reason: new Error("disk full") },
      { status: "fulfilled", value: "written" },
    ]);
  });
});
