import { useEffect, useRef, useState } from "react";
import { ALL_FILES, matchesMask, type FileMask } from "./file-mask";
import { subfolderPath } from "./folder-path";
import styles from "./path-picker.module.css";
import type { FolderListing } from "@/socket/studio-connection";

export type PathMode = "file" | "folder";
export type ListFolder = (path?: string) => Promise<FolderListing>;

interface Props {
  mode: PathMode;
  startDir?: string;
  list: ListFolder;
  masks?: FileMask[];
  onChoose: (path: string) => void;
  onClose: () => void;
}

export default function PathPicker({ mode, startDir, list, masks = [], onChoose, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<string>();
  const [maskIndex, setMaskIndex] = useState(0);
  const { listing, refusal, browse } = useFolderListing(list);
  const shownFile = fileUnderMask(file, [...masks, ALL_FILES][maskIndex]!);

  useEffect(() => {
    dialogRef.current?.showModal();
    browse(startDir);
  }, []);

  return (
    <dialog ref={dialogRef} aria-label={`Choose a ${mode}`} className={styles.dialog} onCancel={onClose}>
      <Listing listing={listing} browse={browse} pickFile={mode === "file" ? setFile : undefined} masks={masks} maskIndex={maskIndex} chooseMask={setMaskIndex} />
      {refusal && <p role="alert">{refusal}</p>}
      {listing && <Choice mode={mode} path={listing.path} file={shownFile}onChoose={onChoose} />}
      <button type="button" onClick={onClose}>Cancel</button>
    </dialog>
  );
}

function fileUnderMask(file: string | undefined, mask: FileMask): string | undefined {
  return file && matchesMask(file, mask.patterns) ? file : undefined;
}

function useFolderListing(list: Props["list"]) {
  const [listing, setListing] = useState<FolderListing>();
  const [refusal, setRefusal] = useState<string>();
  const latestRequest = useRef(0);

  const browse = (path?: string) => {
    const request = ++latestRequest.current;
    const isLatest = () => request === latestRequest.current;

    void list(path).then(
      (listed) => {
        if (!isLatest()) return;
        setRefusal(undefined);
        setListing(listed);
      },
      (error: Error) => {
        if (!isLatest()) return;
        setRefusal(error.message);
        setListing(undefined);
      },
    );
  };

  return { listing, refusal, browse };
}

interface ListingProps {
  listing: FolderListing | undefined;
  browse: (path: string) => void;
  pickFile: ((file: string) => void) | undefined;
  masks: FileMask[];
  maskIndex: number;
  chooseMask: (index: number) => void;
}

function Listing({ listing, browse, pickFile, masks, maskIndex, chooseMask }: ListingProps) {
  const parent = listing?.parent;

  return (
    <>
      {listing && <code>{listing.path}</code>}
      {parent && <button type="button" onClick={() => browse(parent)}>Up</button>}
      <section aria-label="Folders">
        {listing?.folders.map((folder) => (
          <button key={folder} type="button" onClick={() => browse(subfolderPath(listing.path, folder))}>{folder}</button>
        ))}
      </section>
      {pickFile && <Files listing={listing} pick={pickFile} masks={masks} maskIndex={maskIndex} chooseMask={chooseMask} />}
    </>
  );
}

function Choice({ mode, path, file, onChoose }: { mode: PathMode; path: string; file: string | undefined; onChoose: Props["onChoose"] }) {
  if (mode === "folder") return <button type="button" onClick={() => onChoose(path)}>Use this folder</button>;
  if (!file) return null;

  return <button type="button" onClick={() => onChoose(subfolderPath(path, file))}>Use this file</button>;
}

interface FilesProps {
  listing: FolderListing | undefined;
  pick: (file: string) => void;
  masks: FileMask[];
  maskIndex: number;
  chooseMask: (index: number) => void;
}

function Files({ listing, pick, masks, maskIndex, chooseMask }: FilesProps) {
  const choices = [...masks, ALL_FILES];
  const shown = (listing?.files ?? []).filter((file) => matchesMask(file, choices[maskIndex]!.patterns));

  return (
    <>
      <select aria-label="Show files" value={maskIndex} onChange={(event) => chooseMask(Number(event.target.value))}>
        {choices.map(({ label }, index) => (
          <option key={label} value={index}>{label}</option>
        ))}
      </select>
      <section aria-label="Files">
        {shown.map((file) => (
          <button key={file} type="button" onClick={() => pick(file)}>{file}</button>
        ))}
      </section>
    </>
  );
}
