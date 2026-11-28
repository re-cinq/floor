import { useState } from "react";
import LabelledTextField from "./LabelledTextField";
import type { FileMask } from "./file-mask";
import { FolderIcon } from "./icons";
import PathPicker, { type ListFolder, type PathMode } from "./PathPicker";

interface Props {
  label: string;
  browseLabel: string;
  mode: PathMode;
  value: string;
  onChange: (value: string) => void;
  listFolder: ListFolder | undefined;
  startDir?: string;
  masks?: FileMask[];
  error?: string;
  labelClass?: string;
}

export default function PathField({ label, browseLabel, mode, value, onChange, listFolder, startDir, masks, error, labelClass }: Props) {
  const [browsing, setBrowsing] = useState(false);

  const choose = (path: string) => {
    onChange(path);
    setBrowsing(false);
  };

  return (
    <>
      <LabelledTextField label={label} labelClass={labelClass} error={error} value={value} onChange={onChange} addon={listFolder && <BrowseButton label={browseLabel} onClick={() => setBrowsing(true)} />} />
      {browsing && listFolder && <PathPicker mode={mode} startDir={startDir} masks={masks} list={listFolder} onChoose={choose} onClose={() => setBrowsing(false)} />}
    </>
  );
}

function BrowseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label === "Browse" ? undefined : label} onClick={onClick}>
      <FolderIcon />
      Browse
    </button>
  );
}
