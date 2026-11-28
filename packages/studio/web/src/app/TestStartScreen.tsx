import { useEffect, useState } from "react";
import BagTable from "./BagTable";
import WorkspaceField from "./WorkspaceField";
import { useTestPreview, useTestStart, type TestStartControls } from "./use-test-start";
import styles from "./screens.module.css";
import type { LineView } from "@protocol";
import type { TestPreviewFields } from "@/socket/studio-connection";

interface Props {
  line: LineView;
  controls: TestStartControls | undefined;
  onStarted: (run: string) => void;
}

export default function TestStartScreen({ line, controls, onStarted }: Props) {
  const [workspace, setWorkspace] = useState("");
  const [entered, setEntered] = useState<TestPreviewFields["entered"]>({});
  useLastTest(controls, setWorkspace, setEntered);
  const { preview, missing, refusal: previewRefusal } = useTestPreview(controls, entered);
  const { start, refusal } = useTestStart(controls, { workspace, entered, permission: "acceptEdits" }, previewRefusal, onStarted);

  return (
    <div className={`${styles.screen} ${styles.testStart}`}>
      <h1>Test {line.id} locally</h1>
      {preview && <BagTable line={line} asked={preview.asked} entered={entered} missing={missing} onEnter={setEntered} />}
      <WorkspaceField controls={controls} workspace={workspace} onChange={setWorkspace} error={workspace ? undefined : "Choose a workspace folder"} />
      {refusal && <p role="alert">{refusal}</p>}
      <button type="button" onClick={start} disabled={missing.length > 0 || !workspace}>Start</button>
    </div>
  );
}

function useLastTest(controls: TestStartControls | undefined, setWorkspace: (update: (current: string) => string) => void, setEntered: (update: (current: TestPreviewFields["entered"]) => TestPreviewFields["entered"]) => void) {
  useEffect(() => {
    controls?.last().then(
      (last) => {
        if (!last) return;
        setWorkspace((current) => current || last.workspace);
        setEntered((current) => (Object.keys(current).length ? current : last.entered));
      },
      () => undefined,
    );
  }, [controls, setWorkspace, setEntered]);
}
