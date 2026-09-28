import { describe, expect, it } from "vitest";
import { peel, readSinkEvent } from "./sink-event.js";

const SOURCE = { agent: "floor-1", pod: "p", namespace: "n" };
const SHA = "a".repeat(64);

function enveloped(event: unknown): unknown {
  return { source: SOURCE, event };
}

describe("peel", () => {
  it("takes the payload out of the subsystem's envelope", () => {
    expect(peel(enveloped({ type: "assistant" }))).toEqual({ type: "assistant" });
  });

  it("leaves a bare payload as it came", () => {
    expect(peel({ type: "assistant" })).toEqual({ type: "assistant" });
  });
});

describe("readSinkEvent", () => {
  it("reads a Claude stream line as a turn", () => {
    expect(readSinkEvent(enveloped({ type: "assistant", message: {} }))).toEqual({ kind: "turn" });
  });

  it("reads the result line with its text and cost", () => {
    const line = { type: "result", result: "LORE_NODE_RESULT: success", is_error: false, total_cost_usd: 0.42, num_turns: 7, duration_ms: 9000 };

    expect(readSinkEvent(enveloped(line))).toEqual({
      kind: "result",
      text: "LORE_NODE_RESULT: success",
      failed: false,
      cost: { costUsd: 0.42, turns: 7, durationMs: 9000, usage: undefined },
    });
  });

  it("reads an uploaded file as produced under the name after produced.", () => {
    const file = { kind: "file", event: "produced.review_findings", path: "/w/findings.md", uploaded: true, bytes: 10, sha256: SHA };

    expect(readSinkEvent(enveloped(file))).toEqual({ kind: "file", name: "review_findings", ref: `sha256-${SHA}` });
  });

  it("reads a file that was not uploaded as produced with nothing stored", () => {
    const file = { kind: "file", event: "produced.review_findings", path: "/w/findings.md", reason: "missing" };

    expect(readSinkEvent(enveloped(file))).toEqual({ kind: "file", name: "review_findings", ref: null });
  });

  it("forged hash: a sha256 that is not 64 hex characters is not a file event", () => {
    const file = { kind: "file", event: "produced.x", uploaded: true, sha256: "../../etc/passwd" };

    expect(readSinkEvent(enveloped(file))).toEqual({ kind: "log" });
  });

  it("reads the agent phase succeeding as the visit's end", () => {
    expect(readSinkEvent(enveloped({ kind: "lifecycle", phase: "agent", status: "succeeded", exitCode: 0 }))).toEqual({ kind: "ended", failed: false });
  });

  it("reads the agent phase failing, with its exit code", () => {
    const ended = readSinkEvent(enveloped({ kind: "lifecycle", phase: "agent", status: "failed", exitCode: 1 }));

    expect(ended).toEqual({ kind: "ended", failed: true, error: "agent failed: exit code 1" });
  });

  it("reads exit code 124 as a timeout", () => {
    const ended = readSinkEvent(enveloped({ kind: "lifecycle", phase: "agent", status: "failed", exitCode: 124 }));

    expect(ended).toEqual({ kind: "ended", failed: true, error: "timeout: the agent ran past its deadline" });
  });

  it("reads the init phase failing as the visit's end, naming the tool", () => {
    const ended = readSinkEvent(enveloped({ kind: "lifecycle", phase: "init", status: "failed", tool: "files", exitCode: 1 }));

    expect(ended).toEqual({ kind: "ended", failed: true, error: "init failed: tool files, exit code 1" });
  });

  it("reads the init phase finishing as a log line, the agent being still to run", () => {
    expect(readSinkEvent(enveloped({ kind: "lifecycle", phase: "init", status: "succeeded" }))).toEqual({ kind: "log" });
  });

  it("reads a line that was not JSON as a log line", () => {
    expect(readSinkEvent(enveloped("plain text from the pod"))).toEqual({ kind: "log" });
  });
});
