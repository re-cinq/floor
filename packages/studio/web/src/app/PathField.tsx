import { useState } from "react";
import LabelledTextField from "./LabelledTextField";
import PathPicker, { type ListFolder, type PathMode } from "./PathPicker";

interface Props {
  label: string;
  browseLabel: string;
  mode: PathMode;
  value: string;
  onChange: (value: string) => void;
  listFolder: ListFolder | undefined;
  startDir?: string;
}

export default function PathField({ label, browseLabel, mode, value, onChange, listFolder, startDir }: Props) {
  const [browsing, setBrowsing] = useState(false);

  const choose = (path: string) => {
    onChange(path);
    setBrowsing(false);
  };

  return (
    <>
      <LabelledTextField label={label} value={value} onChange={onChange} />
      {listFolder && <button type="button" onClick={() => setBrowsing(true)}>{browseLabel}</button>}
      {browsing && listFolder && <PathPicker mode={mode} startDir={startDir} list={listFolder} onChoose={choose} onClose={() => setBrowsing(false)} />}
    </>
  );
}
