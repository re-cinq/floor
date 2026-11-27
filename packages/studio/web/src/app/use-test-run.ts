import { useEffect, useState } from "react";
import type { TestChangedListener, TestReadResult, TestEventFields, TestReportFields } from "@/socket/studio-connection";
import type { ListFolder } from "./PathPicker";
import type { ReportVisit, SendEvent } from "./stand-in-report";

/** What the run screen needs of a live connection. */
export interface TestRunControls {
  read: (run: string) => Promise<TestReadResult>;
  report: (fields: TestReportFields) => Promise<unknown>;
  sendEvent: (fields: TestEventFields) => Promise<unknown>;
  openFolder: (path: string) => Promise<unknown>;
  listFolder: ListFolder;
  cancel: (run: string) => Promise<unknown>;
  follow: (listener: TestChangedListener) => () => void;
  reopened: (listener: () => void) => () => void;
}

export function useTestRun(controls: TestRunControls | undefined, run: string) {
  const [state, setState] = useState<TestReadResult>();
  const [refusal, setRefusal] = useState<string>();
  const showRefusal = (attempt: Promise<unknown> | undefined) => void attempt?.then(() => setRefusal(undefined), (error: Error) => setRefusal(error.message));
  const report: ReportVisit = (visit, answer) => showRefusal(controls?.report({ run, visit, ...answer }));

  const sendEvent: SendEvent = (event, payload) => showRefusal(controls?.sendEvent({ run, event, payload }));
  const cancel = () => showRefusal(controls?.cancel(run));
  const openRunFolder = () => state && showRefusal(controls?.openFolder(state.folder));
  const openVisitFolder = (visitId: string) => state && showRefusal(controls?.openFolder(`${state.folder}/visits/${visitId}`));

  useEffect(() => {
    // A refused read (an unknown run, or the connection closing) shows its reason on the screen; the state stays as it was.
    const read = () => void controls?.read(run).then(setState, (error: Error) => setRefusal(error.message));
    const unfollow = controls?.follow((frame) => frame.run === run && setState(frame.state));
    const unreopen = controls?.reopened(read);

    read();

    return () => {
      unfollow?.();
      unreopen?.();
    };
  }, [controls, run]);

  return { state, refusal, report, sendEvent, cancel, openRunFolder, openVisitFolder };
}
