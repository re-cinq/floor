import { useMemo } from "react";
import styles from "./screens.module.css";
import type { LineView } from "@protocol";
import type { ListFolder } from "./PathPicker";
import StandInActions from "./StandInActions";
import type { TestReadResult } from "@/socket/studio-connection";
import type { ReportVisit, SendEvent } from "./stand-in-report";
import { useTestRun, type TestRunControls } from "./use-test-run";
import VisitTable from "./VisitTable";
import { overlayOf, waitingOf } from "./run-overlay";
import { graphOf } from "@/graph/graph-of";
import { RunGraphView } from "@re-cinq/floor-graph";

export default function TestRunScreen({ line, run, controls }: { line: LineView; run: string; controls: TestRunControls | undefined }) {
  const { state, refusal, report, sendEvent, cancel, openRunFolder, openVisitFolder } = useTestRun(controls, run);

  const definition = useMemo(() => graphOf(line), [line]);
  const overlay = useMemo(() => overlayOf(state?.visits ?? []), [state]);
  const waiting = useMemo(() => waitingOf(state), [state]);

  return (
    <div className={`${styles.screen} ${styles.testRun}`}>
      <h1>{line.id} test run</h1>
      <div className={styles.runGraph}>
        <RunGraphView definition={definition} run={overlay} waiting={waiting} show="all" />
      </div>
      <RunHeader state={state} cancel={cancel} openRunFolder={openRunFolder} />
      <VisitTable visits={state?.visits ?? []} openVisitFolder={openVisitFolder} />
      <WaitingForYou state={state} report={report} sendEvent={sendEvent} listFolder={controls?.listFolder} />
      {refusal && <p role="alert">{refusal}</p>}
    </div>
  );
}

function RunHeader({ state, cancel, openRunFolder }: { state: TestReadResult | undefined; cancel: () => void; openRunFolder: () => void }) {
  return (
    <>
      <p>{runStatus(state)}</p>
      {(state?.status === "running" || state?.status === "waiting") && <button onClick={cancel}>Cancel</button>}
      {state && <button onClick={openRunFolder}>Open run folder</button>}
    </>
  );
}

function runStatus(state: TestReadResult | undefined): string | undefined {
  return state?.ending?.outcome ?? state?.status;
}

function WaitingForYou({ state, report, sendEvent, listFolder }: { state: TestReadResult | undefined; report: ReportVisit; sendEvent: SendEvent; listFolder: ListFolder | undefined }) {
  const waiting = (state?.visits ?? []).filter((visit) => offeredTo(state, visit.id).length > 0);
  if (waiting.length === 0) return null;

  return (
    <>
      <h2>Waiting for you</h2>
      {waiting.map((visit) => (
        <section key={visit.id} aria-label={visit.id}>
          <h3>{visit.id}</h3>
          <StandInActions actions={offeredTo(state, visit.id)} report={(answer) => report(visit.id, answer)} sendEvent={sendEvent} listFolder={listFolder} />
        </section>
      ))}
    </>
  );
}

function offeredTo(state: TestReadResult | undefined, visitId: string) {
  return state?.actions[visitId] ?? [];
}
