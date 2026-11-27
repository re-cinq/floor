import { describe, expect, it } from "vitest";
import { runCost } from "./run-cost.js";
import type { RunLine } from "./run-process.js";

describe("runCost", () => {
  it("states no cost and no duration when the transcript has one assistant line and no result line", () => {
    const lines: RunLine[] = [
      { stream: "stdout", text: '{"type":"assistant","message":"working"}' },
      { stream: "stderr", text: "warning: slow" },
    ];

    expect(runCost(lines)).toEqual({});
  });

  it("states $0.0421 and 8400 ms from the last stdout result line, passing over an earlier result and one on stderr", () => {
    const lines: RunLine[] = [
      { stream: "stdout", text: '{"type":"assistant","message":"working"}' },
      { stream: "stdout", text: '{"type":"result","result":"draft one","total_cost_usd":0.01,"duration_ms":1000}' },
      { stream: "stderr", text: '{"type":"result","total_cost_usd":9.99,"duration_ms":99999}' },
      { stream: "stdout", text: '{"type":"result","result":"done","total_cost_usd":0.0421,"duration_ms":8400}' },
    ];

    expect(runCost(lines)).toEqual({ costUsd: 0.0421, durationMs: 8400 });
  });

  it.each([
    { label: "sends them as text", text: '{"type":"result","result":"done","total_cost_usd":"0.04","duration_ms":"8400"}' },
    { label: "sends null", text: '{"type":"result","result":"done","total_cost_usd":null,"duration_ms":null}' },
    { label: "names neither", text: '{"type":"result","result":"done"}' },
    { label: "is cut off mid-line", text: '{"type":"result","total_cost_usd":0.04,"duration_ms":8400' },
  ])("states no cost and no duration when the result line $label", ({ text }) => {
    expect(runCost([{ stream: "stdout", text }])).toEqual({});
  });

  it.each([
    { label: "overflows to Infinity", text: '{"type":"result","total_cost_usd":1e999,"duration_ms":1e999}' },
    { label: "is negative", text: '{"type":"result","total_cost_usd":-5,"duration_ms":-1}' },
  ])("states no cost and no duration when the result line's amount $label", ({ text }) => {
    expect(runCost([{ stream: "stdout", text }])).toEqual({});
  });

  it("states $0 and no duration when the result line states cost 0 and duration -1", () => {
    const text = '{"type":"result","total_cost_usd":0,"duration_ms":-1}';

    expect(runCost([{ stream: "stdout", text }])).toEqual({ costUsd: 0 });
  });
});
