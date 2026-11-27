import { useEffect, useRef, useState } from "react";
import { subfolderPath } from "./folder-path";
import styles from "./path-picker.module.css";
import type { FolderListing } from "@/socket/studio-connection";

export type PathMode = "file" | "folder";
export type ListFolder = (path?: string) => Promise<FolderListing>;

interface Props {
  mode: PathMode;
  startDir?: string;
  list: ListFolder;
  onChoose: (path: string) => void;
  onClose: () => void;
}

export default function PathPicker({ mode, startDir, list, onChoose, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<string>();
  const { listing, refusal, browse } = useFolderListing(list);

  useEffect(() => {
    dialogRef.current?.showModal();
    browse(startDir);
  }, []);

  return (
    <dialog ref={dialogRef} aria-label={`Choose a ${mode}`} className={styles.dialog} onCancel={onClose}>
      <Listing listing={listing} browse={browse} pickFile={mode === "file" ? setFile : undefined} />
      {refusal && <p role="alert">{refusal}</p>}
      {listing && <Choice mode={mode} path={listing.path} file={file} onChoose={onChoose} />}
      <button type="button" onClick={onClose}>Cancel</button>
    </dialog>
  );
}

function useFolderListing(list: Props["list"]) {
  const [listing, setListing] = useState<FolderListing>();
  const [refusal, setRefusal] = useState<string>();
  const browse = (path?: string) =>
    void list(path).then(
      (listed) => {
        setRefusal(undefined);
        setListing(listed);
      },
      (error: Error) => {
        setRefusal(error.message);
        setListing(undefined);
      },
    );

  return { listing, refusal, browse };
}

function Listing({ listing, browse, pickFile }: { listing: FolderListing | undefined; browse: (path: string) => void; pickFile: ((file: string) => void) | undefined }) {
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
      {pickFile && <Files listing={listing} pick={pickFile} />}
    </>
  );
}

function Choice({ mode, path, file, onChoose }: { mode: PathMode; path: string; file: string | undefined; onChoose: Props["onChoose"] }) {
  if (mode === "folder") return <button type="button" onClick={() => onChoose(path)}>Use this folder</button>;
  if (!file) return null;

  return <button type="button" onClick={() => onChoose(subfolderPath(path, file))}>Use this file</button>;
}

function Files({ listing, pick }: { listing: FolderListing | undefined; pick: (file: string) => void }) {
  return (
    <section aria-label="Files">
      {listing?.files.map((file) => (
        <button key={file} type="button" onClick={() => pick(file)}>{file}</button>
      ))}
    </section>
  );
}
