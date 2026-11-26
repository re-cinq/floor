import assert from "node:assert/strict";
import { test } from "node:test";

process.env.FLOOR_API_URL = "http://floor.test";
process.env.FLOOR_SERVICE_TOKEN = "test";

function visit(context, name, needs) {
  let claimed = false;
  const posted = Promise.withResolvers();
  const stored = [];
  context.mock.method(globalThis, "fetch", async (url, request) => {
    switch (new URL(url).pathname) {
      case "/events/claim": {
        assert.deepEqual(JSON.parse(request.body).tags, [`station:${name}`]);
        const events = claimed ? [] : [{ id: "event", name: "station_run.dispatch", payload: { visitId: "visit" } }];
        claimed = true;
        return Response.json(events);
      }
      case "/station-runs/visit/brief":
        return Response.json({ visitId: "visit", deadlineMinutes: 1, token: "visit-token", needs });
      case "/blobs/original":
        return new Response("Hello, Ada!");
      case "/blobs":
        stored.push(Buffer.from(request.body).toString());
        return Response.json({ hash: "copy-hash", size: 11 });
      case "/events":
        posted.resolve(JSON.parse(request.body).payload.report);
        return new Response(null, { status: 201 });
      case "/events/event/ack":
        return new Response(null, { status: 204 });
      default:
        throw new Error(`Unexpected request: ${url}`);
    }
  });
  return { report: posted.promise, stored };
}

const nameInput = [{ kind: "value", name: "name", value: "Ada" }];
const greeting = { outcome: "success", produced: { greeting: "Hello, Ada!" } };

test("the continuous hello worker reports Hello, Ada!", async (context) => {
  const { report } = visit(context, "hello", nameInput);
  const { station } = await import("./worker.mjs");
  context.after(() => station.stop());
  assert.deepEqual(await report, greeting);
});

test("one poll reports Hello, Ada! and exits", async (context) => {
  const { report } = visit(context, "hello", nameInput);
  await import("./poll.mjs");
  assert.deepEqual(await report, greeting);
});

test("copy-note stores the input bytes and reports the stored file", async (context) => {
  const { report, stored } = visit(context, "copy-note", [{ kind: "file", name: "note", url: "http://floor.test/blobs/original" }]);
  const { station } = await import("./file-worker.mjs");
  context.after(() => station.stop());
  assert.deepEqual(await report, { outcome: "success", produced: { copy: "copy-hash" } });
  assert.deepEqual(stored, ["Hello, Ada!"]);
});
