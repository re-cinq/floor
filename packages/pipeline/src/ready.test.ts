import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { waitUntilReady } from "./ready.js";

const POLL_MS = 5;
const NOT_READY = 503;
const READY = 200;
const servers: Server[] = [];

async function floorAnswering(statuses: number[]): Promise<{ floorUrl: string; asked: () => number }> {
  let asks = 0;
  const server = createServer((request, response) => {
    response.statusCode = statuses[Math.min(asks, statuses.length - 1)] ?? NOT_READY;
    asks += 1;
    response.end();
  });

  servers.push(server);
  await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
  const { port } = server.address() as AddressInfo;

  return { floorUrl: `http://127.0.0.1:${port}`, asked: () => asks };
}

afterEach(() => {
  servers.splice(0).forEach((server) => server.close());
});

describe("waitUntilReady", () => {
  it("returns once the floor answers ready", async () => {
    const { floorUrl, asked } = await floorAnswering([READY]);

    await waitUntilReady({ floorUrl, seconds: 5, pollMs: POLL_MS });

    expect(asked()).toEqual(1);
  });

  it("waits through a floor that is not ready yet", async () => {
    const { floorUrl, asked } = await floorAnswering([NOT_READY, NOT_READY, READY]);

    await waitUntilReady({ floorUrl, seconds: 5, pollMs: POLL_MS });

    expect(asked()).toEqual(3);
  });

  it("gives up on a floor that never answers ready, and says how long it waited", async () => {
    const { floorUrl } = await floorAnswering([NOT_READY]);

    await expect(waitUntilReady({ floorUrl, seconds: 0.05, pollMs: POLL_MS })).rejects.toThrow(new Error(`the floor at ${floorUrl} did not answer ready in 0.05 seconds`));
  });
});
