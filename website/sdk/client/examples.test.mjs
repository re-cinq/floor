import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceToken, visitToken } from "@re-cinq/floor-client";
import { startGreeting } from "./start.mts";
import { watchOutcome } from "./watch-run.mts";
import { followRuns } from "./watch-floor.mts";
import { finishVisit } from "./visit.mts";

const access = { url: "http://floor.test", token: serviceToken("service") };

test("starting a greeting for Ada joins run-1", async () => {
  const fetchFn = async (url, request) => {
    assert.equal(url, "http://floor.test/assembly-lines/hello-world/start");
    assert.equal(request.headers.authorization, "Bearer service");
    assert.deepEqual(JSON.parse(request.body), { startItems: { name: { kind: "value", ref: "Ada", by: "client" } } });
    return Response.json({ run: { id: "run-1" }, joined: true });
  };
  assert.deepEqual(await startGreeting({ ...access, fetchFn }, "Ada"), { id: "run-1", joined: true });
});

function stream(path, frames) {
  return (url, options) => {
    assert.equal(url, `ws://floor.test${path}`);
    assert.equal(options.headers.authorization, "Bearer service");
    let closed;
    return {
      onFrame: receive => queueMicrotask(() => frames.forEach(frame => receive(JSON.stringify(frame)))),
      onClosed: callback => { closed = callback; },
      close: () => closed({ code: 1000, reason: "" }),
    };
  };
}

test("a settled run returns success after replay", async () => {
  const socketFn = stream("/assembly-runs/run-1/live?after=0", [
    { type: "caught_up", seq: 1 }, { type: "run_settled", seq: 2, run: { outcome: "success" } },
  ]);
  assert.equal(await watchOutcome({ ...access, socketFn }, "run-1"), "success");
});

test("a resync refreshes the list and a change refreshes run-1", async () => {
  const socketFn = stream("/assembly-runs/live", [{ type: "resync" }, { type: "run_changed", runId: "run-1" }]);
  const refreshed = [];
  const controller = new AbortController();
  await followRuns({ ...access, socketFn }, async id => {
    refreshed.push(id);
    if (id) controller.abort();
  }, controller.signal);
  assert.deepEqual(refreshed, [undefined, "run-1"]);
});

test("reporting Hello, Ada! binds the outcome to visit-7", async () => {
  const sent = [];
  const fetchFn = async (url, request) => {
    sent.push([url, request.headers.authorization, JSON.parse(request.body)]);
    return new Response(null, { status: 201 });
  };
  await finishVisit({ url: access.url, visitId: "visit-7", token: visitToken("visit"), fetchFn }, "Hello, Ada!");
  assert.deepEqual(sent, [["http://floor.test/events", "Bearer visit", {
    name: "station_run.reported", dedupeKey: "station_run.reported:visit-7",
    payload: { visitId: "visit-7", report: { outcome: "success", produced: { greeting: "Hello, Ada!" } }, worker: "greeter" },
  }]]);
});

function tutorialFloor(context, outcome, bag) {
  context.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(request.headers.authorization, "Bearer tutorial-token");
    if (url === "http://floor.test/assembly-lines/hello-world/start") return Response.json({ run: { id: "tutorial" }, joined: false });
    assert.equal(url, "http://floor.test/assembly-runs/tutorial");
    return Response.json({ bag });
  });
  class TutorialSocket extends EventTarget {
    constructor(url) {
      super();
      assert.equal(url, "ws://floor.test/assembly-runs/tutorial/live?after=0");
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({ type: "run_settled", seq: 1, run: { outcome } }),
      })));
    }
    close() {}
  }
  context.mock.property(globalThis, "WebSocket", TutorialSocket);

  process.env.FLOOR_API_URL = "http://floor.test";
  process.env.FLOOR_SERVICE_TOKEN = "tutorial-token";
}

test("the tutorial starts a run and prints Hello, Ada! from the settled bag", async (context) => {
  tutorialFloor(context, "success", { greeting: { kind: "value", ref: "Hello, Ada!" } });
  const output = context.mock.method(console, "log", () => {});
  await import("./hello.mts");
  assert.deepEqual(output.mock.calls.map(call => call.arguments), [["Hello, Ada!"]]);
});

test("a refused watch rejects with the reason it ended", async () => {
  const socketFn = () => ({
    onFrame() {},
    onClosed(receive) { queueMicrotask(() => receive({ code: 4401, reason: "invalid token" })); },
    close() {},
  });
  await assert.rejects(watchOutcome({ ...access, socketFn }, "run-1"), /Watch ended before settlement: refused/);
});

for (const variable of ["FLOOR_API_URL", "FLOOR_SERVICE_TOKEN"]) {
  test(`the tutorial refuses to start without ${variable}`, async context => {
    tutorialFloor(context, "success", {});
    const previous = process.env[variable];
    delete process.env[variable];
    context.after(() => { process.env[variable] = previous; });
    await assert.rejects(import(`./hello.mts?missing=${variable}`), /Set FLOOR_API_URL and FLOOR_SERVICE_TOKEN/);
  });
}

test("a failed run identifies its outcome", async context => {
  tutorialFloor(context, "failed", {});
  await assert.rejects(import("./hello.mts?failed"), /Run tutorial settled with outcome failed/);
});

test("a successful run with an empty bag identifies the missing greeting", async context => {
  tutorialFloor(context, "success", {});
  await assert.rejects(import("./hello.mts?empty"), /Run tutorial has no greeting value/);
});
