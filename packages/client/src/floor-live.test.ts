import { describe, expect, it } from "vitest";
import type { FloorFrame } from "@re-cinq/floor-contracts";
import { CLOSE, type SocketFn } from "./live.js";
import { watchFloor } from "./floor-live.js";
import { serviceToken } from "./tokens.js";

const TOKEN = serviceToken("service-token");

interface Opened {
  url: string;
  headers: Record<string, string>;
  say(frame: FloorFrame): void;
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

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("a watch over the floor's live socket", () => {
  it("opens /assembly-runs/live with the service token and hands out each frame until it is stopped", async () => {
    const { opened, socketFn } = fakeSockets();
    const watch = watchFloor({ url: "http://floor.test", token: TOKEN, socketFn }, { backoffMs: () => 0 });

    await settled();
    opened[0]!.say({ type: "resync" });
    opened[0]!.say({ type: "run_started", runId: "run-1" });
    watch.stop();

    const seen: FloorFrame[] = [];

    for await (const frame of watch) seen.push(frame);

    expect({ url: opened[0]?.url, authorization: opened[0]?.headers.authorization, seen, ended: await watch.ended }).toEqual({
      url: "ws://floor.test/assembly-runs/live",
      authorization: "Bearer service-token",
      seen: [{ type: "resync" }, { type: "run_started", runId: "run-1" }],
      ended: { reason: "stopped" },
    });
  });
});
