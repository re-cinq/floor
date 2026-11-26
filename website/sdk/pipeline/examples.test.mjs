import assert from "node:assert/strict";
import { test } from "node:test";
import { readDefinition } from "./read.mts";
import { installDefinition } from "./import.mts";

test("hello.yaml defines hello-world with a hello station", async () => {
  const pipeline = await readDefinition("hello.yaml");
  assert.equal(pipeline.line.id, "hello-world");
  assert.deepEqual(pipeline.stations.map(station => station.id), ["hello"]);
});

test("importing hello.yaml returns the change reported for each definition", async context => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, request) => {
    const id = JSON.parse(request.body).id;
    calls.push([url, request.method, request.headers.authorization, id]);
    return Response.json({ created: id === "hello-world" });
  });
  const changes = await installDefinition({ url: "http://floor.test", token: "example" }, "hello.yaml");
  assert.deepEqual(calls, [
    ["http://floor.test/stations", "POST", "Bearer example", "hello"],
    ["http://floor.test/assembly-lines", "POST", "Bearer example", "hello-world"],
  ]);
  assert.deepEqual(changes, [
    { kind: "stations", id: "hello", changed: false },
    { kind: "assembly-lines", id: "hello-world", changed: true },
  ]);
});
