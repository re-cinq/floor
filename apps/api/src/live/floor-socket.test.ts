import { once } from "node:events";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestServer } from "../test-server.js";
import { workStarted } from "../test-fixtures.js";
import { watchFloor } from "./live-fixtures.js";

const { server, deps } = setupTestServer();

const BEYOND_PATIENCE_MS = 7000;

beforeAll(async () => {
  await server().start();
});

describe("GET /assembly-runs/live, watched", () => {
  it(
    "tells a viewer of a run started after it connected, by the run's id",
    async () => {
      const watched = watchFloor({ floor: server() });

      await once(watched.socket, "open");
      await watched.told("resync");
      const { runId } = await workStarted(deps());

      expect(await watched.told("run_started")).toEqual({ type: "run_started", runId });
      watched.socket.close();
    },
    BEYOND_PATIENCE_MS,
  );
});
