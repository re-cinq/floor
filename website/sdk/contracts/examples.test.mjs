import assert from "node:assert/strict";
import { test } from "node:test";
import { greetingReport } from "./report.mts";
import { refreshTarget } from "./frame.mts";

test("Ada produces a successful greeting", () => {
  assert.deepEqual(greetingReport({ needs: { name: "Ada" }, iteration: 1 }), {
    outcome: "success", produced: { greeting: "Hello, Ada!" },
  });
});

test("a missing name produces a failed report", () => {
  assert.deepEqual(greetingReport({ needs: {}, iteration: 1 }), {
    outcome: "failed", error: "A greeting needs a name",
  });
});

test("resync refreshes the whole list", () => {
  assert.deepEqual(refreshTarget({ type: "resync" }), { scope: "all" });
});

for (const type of ["run_started", "run_changed"]) {
  test(`${type} refreshes just run-7`, () => {
    assert.deepEqual(refreshTarget({ type, runId: "run-7" }), { scope: "run", id: "run-7" });
  });
}
