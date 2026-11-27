import { useEffect, useState } from "react";
import type { FolderListing, TestPreviewFields, TestPreviewResult, TestStartFields, TestStartResult } from "@/socket/studio-connection";

/** Previews a test run of the line for the inputs entered so far. */
export type PreviewTest = (entered: TestPreviewFields["entered"]) => Promise<TestPreviewResult>;

/** Starts a test run of the line with the workspace folder and inputs entered. */
export type StartTest = (fields: Omit<TestStartFields, "line">) => Promise<TestStartResult>;

/** What the start screen needs of a live connection, for the selected line. */
export interface TestStartControls {
  preview: PreviewTest;
  start: StartTest;
  listFolder: (path: string) => Promise<FolderListing>;
}

export function useTestPreview(controls: TestStartControls | undefined, entered: TestPreviewFields["entered"]) {
  const [preview, setPreview] = useState<TestPreviewResult>();
  const [refusal, setRefusal] = useState<string>();

  useEffect(() => {
    let ignore = false;
    controls?.preview(entered).then(
      (answer) => !ignore && setPreview(answer),
      (reason: Error) => !ignore && setRefusal(reason.message),
    );

    return () => {
      ignore = true;
    };
  }, [controls, entered]);

  return { preview, missing: preview?.missing ?? [], refusal };
}

/** Starts the test run; a refusal replaces the preview's, so the screen shows one. */
export function useTestStart(controls: TestStartControls | undefined, fields: Parameters<StartTest>[0], previewRefusal: string | undefined, onStarted: (run: string) => void) {
  const [startRefusal, setStartRefusal] = useState<string>();
  const start = () => void controls?.start(fields).then(({ run }) => onStarted(run), (reason: Error) => setStartRefusal(reason.message));

  return { start, refusal: startRefusal ?? previewRefusal };
}
