import { useEffect, useRef, useState } from "react";
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
  const [refusal, setRefusal] = useState<string>();

  useEffect(() => follow?.((frame) => setFrames((held) => [...held, frame])), [follow]);

  const startedHere = useRef<string>(undefined);

  // A run this hook started is told live from its first line; a read answered later would replace those lines with fewer.
  useEffect(() => {
    if (run && read && run !== startedHere.current) void read(run, 0).then((answer) => setFrames(framesOfRead(run, answer)), (error: Error) => setRefusal(error.message));
  }, [read]);

  const own = frames.filter((frame) => frame.run === run);
  const ended = own.find((frame): frame is RunEnded => frame.type === "run.ended");
  const lines = own.flatMap((frame) => (frame.type === "run.output" ? [frame.line] : []));

  useReportedEdge(ended, runs?.onEnded);

  return {
    lines,
    ended,
    isRunning: run !== undefined && !ended,
    refusal,
    start: (fields: RunFields) => {
      setFrames([]);
      setRefusal(undefined);
      void runs?.start(fields).then(keepRun(runs, (started) => { startedHere.current = started; setRun(started); }), (error: Error) => setRefusal(error.message));
    },
    cancel: () => void (run && runs?.cancel(run)),
  };
}

/** Holds the started run as the current one, and has the address keep it. */
function keepRun(runs: RunControls, setRun: (run: string) => void) {
  return (started: { run: string }) => {
    setRun(started.run);
    runs.keep?.(started.run);
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
