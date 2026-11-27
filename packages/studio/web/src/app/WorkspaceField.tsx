import PathField from "./PathField";
import type { TestStartControls } from "./use-test-start";

interface Props {
  controls: TestStartControls | undefined;
  workspace: string;
  onChange: (folder: string) => void;
  error?: string;
}

export default function WorkspaceField({ controls, workspace, onChange, error }: Props) {
  return (
    <PathField label="Workspace folder" browseLabel="Browse" mode="folder" error={error} value={workspace} onChange={onChange} listFolder={controls && ((path) => controls.listFolder(path))} startDir={workspace || undefined} />
  );
}
