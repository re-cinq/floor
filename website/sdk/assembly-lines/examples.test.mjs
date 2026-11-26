import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { getNextTransition, validateLine } from "@re-cinq/floor-assembly-lines";
import { catalogue, graph, line, problems } from "./hello.mts";

test("Hello World validates against its station catalogue", () => {
  assert.deepEqual(problems, []);
});

test("a missing exit is reported by name", () => {
  assert.ok(validateLine({ ...line, exit: "missing" }, catalogue).includes('exit "missing" is not a node'));
});

test("the tutorial prints launch, await, finish and halt in order", () => {
  const output = execFileSync(process.execPath, ["replay.mts"], { encoding: "utf8" });
  assert.deepEqual(output.trim().split("\n"), [
    "Validation problems: []", "Before any visit: launch", "While greet is open: await",
    "After success: finish", "After failure: halt",
  ]);
});

test("a failed greeting halts with the failed outcome", () => {
  const transition = getNextTransition(graph, [{ nodeId: "greet", iteration: 1, outcome: "failed" }]);
  assert.equal(transition.outcome, "failed");
});
