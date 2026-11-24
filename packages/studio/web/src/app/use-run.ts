import { useEffect, useState } from "react";
import type { RunFrame, RunReadResult } from "@/socket/studio-connection";
import type { RunControls, RunFields } from "./RunPanel";

export type RunOutput = Extract<RunFrame, { type: "run.output" }>["line"];
export type RunEnded = Extract<RunFrame, { type: "run.ended" }>;

/** The current run of a node: its transcript lines, how it ended, and the means to start and cancel it. */
export function useRun(runs: RunControls | undefined) {
  const [frames, setFrames] = useState<RunFrame[]>([]);
  const [run, setRun] = useState(runs?.current);
  const follow = runs?.follow;
  const read = runs?.read;

  useEffect(() => follow?.((frame) => setFrames((held) => [...held, frame])), [follow]);

  useEffect(() => {
    if (run && read) void read(run, 0).then((answer) => setFrames(framesOfRead(run, answer)), () => undefined);
  }, [read]);

  const own = frames.filter((frame) => frame.run === run);
  const ended = own.find((frame): frame is RunEnded => frame.type === "run.ended");
  const lines = own.flatMap((frame) => (frame.type === "run.output" ? [frame.line] : []));

  useReportedEdge(ended, runs?.onEnded);

  return {
    lines,
    ended,
    isRunning: run !== undefined && !ended,
    start: (fields: RunFields) => {
      setFrames([]);
      void runs?.start(fields).then((started) => {
        setRun(started.run);
        runs.keep?.(started.run);
      });
    },
    cancel: () => void (run && runs?.cancel(run)),
  };
}

/** A read of a run's transcript, as the frames it would have arrived in. */
function framesOfRead(run: string, { lines, ended }: RunReadResult): RunFrame[] {
  const output = lines.map((line): RunFrame => ({ type: "run.output", run, line }));

  return ended ? [...output, { type: "run.ended", run, ...ended }] : output;
}

/** Tells the page the edge a run took, once the run has ended with one. */
function useReportedEdge(ended: RunEnded | undefined, onEnded: RunControls["onEnded"]) {
  useEffect(() => { if (ended?.edge) onEnded?.(ended.edge); }, [ended, onEnded]);
}
