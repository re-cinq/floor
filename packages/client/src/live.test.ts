import { describe, expect, it } from "vitest";
import type { LiveFrame } from "@re-cinq/floor-contracts";
import { CLOSE, watchRun, type SocketFn } from "./live.js";
import { serviceToken } from "./tokens.js";

const TOKEN = serviceToken("service-token");

interface Opened {
  url: string;
  headers: Record<string, string>;
  say(frame: LiveFrame): void;
  shut(code: number, reason?: string): void;
}

function fakeSockets(): { opened: Opened[]; socketFn: SocketFn } {
  const opened: Opened[] = [];

  const socketFn: SocketFn = (url, init) => {
    const heardFrames: ((frame: string) => void)[] = [];
    const heardCloses: ((closed: { code: number; reason: string }) => void)[] = [];
    const shut = (code: number, reason = ""): void => heardCloses.forEach((heard) => heard({ code, reason }));

    opened.push({ url, headers: init.headers, say: (frame) => heardFrames.forEach((heard) => heard(JSON.stringify(frame))), shut });

    return {
      onFrame: (heard) => heardFrames.push(heard),
      onClosed: (heard) => heardCloses.push(heard),
      close: (code = CLOSE.settled, reason = "") => shut(code, reason),
    };
  };

  return { opened, socketFn };
}

function watching(after?: number) {
  const { opened, socketFn } = fakeSockets();
  const watch = watchRun({ url: "http://floor.test", token: TOKEN, socketFn }, "run-1", { after, backoffMs: () => 0 });

  return { opened, watch };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const CAUGHT_UP: LiveFrame = { type: "caught_up", seq: 7 };

describe("a watch over the live socket", () => {
  it("opens at the cursor it was given, with the service token on the upgrade", async () => {
    const { opened } = watching(12);

    await settled();

    expect(opened[0]).toMatchObject({ url: "ws://floor.test/assembly-runs/run-1/live?after=12", headers: { authorization: "Bearer service-token" } });
  });

  it("hands out each frame in turn and ends when the run settles", async () => {
    const { opened, watch } = watching();

    await settled();
    opened[0]!.say(CAUGHT_UP);
    opened[0]!.say({ type: "run_settled", seq: 8, run: { id: "run-1" } as never });
    opened[0]!.shut(CLOSE.settled, "the run settled");

    const seen: LiveFrame[] = [];

    for await (const frame of watch) seen.push(frame);

    expect({ seen: seen.map((frame) => frame.type), ended: await watch.ended }).toEqual({ seen: ["caught_up", "run_settled"], ended: { reason: "settled" } });
  });

  it("comes back at the last seq it handed out when the floor stops", async () => {
    const { opened } = watching();

    await settled();
    opened[0]!.say(CAUGHT_UP);
    opened[0]!.shut(CLOSE.stopping, "the floor is stopping");
    await settled();

    expect(opened[1]?.url).toBe("ws://floor.test/assembly-runs/run-1/live?after=7");
  });

  it("comes back after a dropped connection too", async () => {
    const { opened } = watching(3);

    await settled();
    opened[0]!.shut(CLOSE.dropped);
    await settled();

    expect(opened[1]?.url).toBe("ws://floor.test/assembly-runs/run-1/live?after=3");
  });

  it("does not come back when there is no such run", async () => {
    const { opened, watch } = watching();

    await settled();
    opened[0]!.shut(CLOSE.noSuchRun, "no run");
    await settled();

    expect({ ended: await watch.ended, opened: opened.length }).toEqual({ ended: { reason: "refused", code: CLOSE.noSuchRun, detail: "no run" }, opened: 1 });
  });

  it("does not come back when the run already has too many viewers, since retrying would only press harder", async () => {
    const { opened, watch } = watching();

    await settled();
    opened[0]!.shut(CLOSE.tooManyViewers, "too many");
    await settled();

    expect({ ended: await watch.ended, opened: opened.length }).toMatchObject({ ended: { reason: "refused", code: CLOSE.tooManyViewers }, opened: 1 });
  });

  it("keeps the unsupported frame's lack of a seq from moving the cursor", async () => {
    const { opened, watch } = watching();

    await settled();
    opened[0]!.say(CAUGHT_UP);
    opened[0]!.say({ type: "unsupported" });

    expect(watch.seq).toBe(7);
  });

  it("truncates a cursor the floor would refuse rather than spending a connection to be told", async () => {
    const { opened, socketFn } = fakeSockets();

    watchRun({ url: "http://floor.test", token: TOKEN, socketFn }, "run-1", { after: 4.7, backoffMs: () => 0 });
    await settled();

    expect(opened[0]?.url).toBe("ws://floor.test/assembly-runs/run-1/live?after=4");
  });
});
