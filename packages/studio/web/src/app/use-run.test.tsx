// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RunFrame, RunReadResult } from "@/socket/studio-connection";
import type { RunControls } from "./RunPanel";
import { useRun } from "./use-run";

const FIELDS = { fixture: {}, folder: "/tmp/run", permission: "acceptEdits" as const };

function controlsWith(listeners: ((frame: RunFrame) => void)[], read: RunControls["read"], current?: string): RunControls {
  return {
    start: () => Promise.resolve({ run: "r1" }),
    cancel: () => Promise.resolve(),
    follow: (listener) => {
      listeners.push(listener);

      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    read: (run, after) => read(run, after),
    current,
  };
}

describe("useRun", () => {
  it("keeps the line done it was told live when a read of run r1, sent before the line, answers after it", async () => {
    const listeners: ((frame: RunFrame) => void)[] = [];
    let answerRead: (answer: RunReadResult) => void = () => undefined;
    const lateRead = () => new Promise<RunReadResult>((resolve) => { answerRead = resolve; });
    const { result, rerender } = renderHook(({ controls }) => useRun(controls), { initialProps: { controls: controlsWith(listeners, lateRead) } });

    await act(async () => result.current.start(FIELDS));
    rerender({ controls: controlsWith(listeners, lateRead, "r1") });
    act(() => listeners.forEach((tell) => tell({ type: "run.output", run: "r1", line: { stream: "stdout", text: "done" } })));
    await act(async () => answerRead({ lines: [] }));
    const { lines } = result.current;

    expect(lines.map((line) => line.text)).toEqual(["done"]);
  });
});
