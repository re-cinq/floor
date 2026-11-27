import { useState } from "react";
import LabelledTextField from "./LabelledTextField";
import PathPicker from "./PathPicker";
import type { TestStartControls } from "./use-test-start";

interface Props {
  controls: TestStartControls | undefined;
  workspace: string;
  onChange: (folder: string) => void;
}

export default function WorkspaceField({ controls, workspace, onChange }: Props) {
  const [browsing, setBrowsing] = useState(false);

  const choose = (folder: string) => {
    onChange(folder);
    setBrowsing(false);
  };

  return (
    <>
      <LabelledTextField label="Workspace folder" value={workspace} onChange={onChange} />
      <button type="button" onClick={() => setBrowsing(true)}>Browse</button>
      {browsing && controls && (
        <PathPicker startDir={workspace || undefined} list={(path) => controls.listFolder(path)} onChoose={choose} onClose={() => setBrowsing(false)} />
      )}
    </>
  );
}
