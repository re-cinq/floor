import { useEffect, useRef, useState } from "react";
import { ALL_FILES, matchesMask, type FileMask } from "./file-mask";
import { childPath } from "./folder-path";
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
  const [pickedPath, setPickedPath] = useState<string>();
  const [maskIndex, setMaskIndex] = useState(0);
  const { listing, refusal, browse } = useFolderListing(list);
  const offeredFile = offeredPath(pickedPath, listing, [...masks, ALL_FILES][maskIndex]!);

  useEffect(() => {
    dialogRef.current?.showModal();
    browse(startDir);
  }, []);

  return (
    <dialog ref={dialogRef} aria-label={`Choose a ${mode}`} className={styles.dialog} onCancel={onClose}>
      <Listing listing={listing} browse={browse} pickFile={mode === "file" && listing ? (name) => setPickedPath(childPath(listing.path, name)) : undefined} masks={masks} maskIndex={maskIndex} chooseMask={setMaskIndex} />
      {refusal && <p role="alert">{refusal}</p>}
      {listing && <Choice mode={mode} path={listing.path} filePath={offeredFile} onChoose={onChoose} />}
      <button type="button" onClick={onClose}>Cancel</button>
    </dialog>
  );
}

function offeredPath(pickedPath: string | undefined, listing: FolderListing | undefined, mask: FileMask): string | undefined {
  if (!listing) return undefined;
  const isOffered = (name: string) => childPath(listing.path, name) === pickedPath && matchesMask(name, mask.patterns);

  return listing.files.some(isOffered) ? pickedPath : undefined;
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
          <button key={folder} type="button" onClick={() => browse(childPath(listing.path, folder))}>{folder}</button>
        ))}
      </section>
      {pickFile && <Files listing={listing} pick={pickFile} masks={masks} maskIndex={maskIndex} chooseMask={chooseMask} />}
    </>
  );
}

function Choice({ mode, path, filePath, onChoose }: { mode: PathMode; path: string; filePath: string | undefined; onChoose: Props["onChoose"] }) {
  if (mode === "folder") return <button type="button" onClick={() => onChoose(path)}>Use this folder</button>;
  if (!filePath) return null;

  return <button type="button" onClick={() => onChoose(filePath)}>Use this file</button>;
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
