import { describe, expect, it } from "vitest";
import type { FloorFrame } from "@re-cinq/floor-contracts";
import { CLOSE } from "./live.js";
import { fakeSockets, settled } from "./live-fixtures.js";
import { watchFloor } from "./floor-live.js";
import { serviceToken } from "./tokens.js";

const TOKEN = serviceToken("service-token");

function watching() {
  const { opened, socketFn } = fakeSockets<FloorFrame>();
  const watch = watchFloor({ url: "http://floor.test", token: TOKEN, socketFn }, { backoffMs: () => 0 });

  return { opened, watch };
}

describe("a watch over the floor's live socket", () => {
  it("opens /assembly-runs/live with the service token and hands out each frame until it is stopped", async () => {
    const { opened, watch } = watching();

    await settled();
    opened[0]!.say({ type: "resync" });
    opened[0]!.say({ type: "run_started", runId: "run-1" });
    watch.stop();

    const seen: FloorFrame[] = [];

    for await (const frame of watch) seen.push(frame);

    const [first] = opened;

    expect({ url: first.url, authorization: first.headers.authorization, seen, ended: await watch.ended }).toEqual({
      url: "ws://floor.test/assembly-runs/live",
      authorization: "Bearer service-token",
      seen: [{ type: "resync" }, { type: "run_started", runId: "run-1" }],
      ended: { reason: "stopped" },
    });
  });

  it("opens a second socket at the same url when the floor stops", async () => {
    const { opened, watch } = watching();

    await settled();
    opened[0]!.shut(CLOSE.stopping, "the floor is stopping");
    await settled();
    watch.stop();

    expect(opened.map((socket) => socket.url)).toEqual(["ws://floor.test/assembly-runs/live", "ws://floor.test/assembly-runs/live"]);
  });

  it("ends refused with the detail when the floor closes with 4401", async () => {
    const { opened, watch } = watching();

    await settled();
    opened[0]!.shut(4401, "a run is watched with the service token");

    expect({ ended: await watch.ended, opened: opened.length }).toEqual({
      ended: { reason: "refused", code: 4401, detail: "a run is watched with the service token" },
      opened: 1,
    });
  });
});
