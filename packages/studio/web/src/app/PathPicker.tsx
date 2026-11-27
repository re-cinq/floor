import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ALL_FILES, matchesMask, type FileMask } from "./file-mask";
import { childPath } from "./folder-path";
import { UpIcon } from "./icons";
import PathPickerList, { MaskSelect } from "./PathPickerList";
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
  const titleId = useId();
  const mask = [...masks, ALL_FILES][maskIndex]!;
  const offeredFile = offeredPath(pickedPath, listing, mask);

  useEffect(() => {
    dialogRef.current?.showModal();
    browse(startDir);
  }, []);

  const pickFile = mode === "file" && listing ? (name: string) => setPickedPath(childPath(listing.path, name)) : undefined;

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className={styles.dialog} onCancel={onClose}>
      <h2 id={titleId} className={styles.title}>Choose a {mode}</h2>
      <Toolbar listing={listing} browse={browse} />
      {refusal && <p role="alert" className={styles.refusal}>{refusal}</p>}
      <PathPickerList listing={listing} browse={browse} pickFile={pickFile} pickedPath={offeredFile} mask={mask} />
      <Footer mode={mode} masks={masks} maskIndex={maskIndex} chooseMask={setMaskIndex} onClose={onClose}>
        {listing && <Choice mode={mode} path={listing.path} filePath={offeredFile} onChoose={onChoose} />}
      </Footer>
    </dialog>
  );
}

function Toolbar({ listing, browse }: { listing: FolderListing | undefined; browse: (path: string) => void }) {
  const parent = listing?.parent;

  return (
    <div className={styles.toolbar}>
      {parent && <button type="button" className={styles.up} aria-label="Up" onClick={() => browse(parent)}><UpIcon /></button>}
      <div className={styles.pathBar}>{listing && <code>{listing.path}</code>}</div>
    </div>
  );
}

interface FooterProps {
  mode: PathMode;
  masks: FileMask[];
  maskIndex: number;
  chooseMask: (index: number) => void;
  onClose: () => void;
  children: ReactNode;
}

function Footer({ mode, masks, maskIndex, chooseMask, onClose, children }: FooterProps) {
  return (
    <div className={styles.footer}>
      {mode === "file" && <MaskSelect masks={masks} maskIndex={maskIndex} chooseMask={chooseMask} />}
      <span className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onClose}>Cancel</button>
        {children}
      </span>
    </div>
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

function Choice({ mode, path, filePath, onChoose }: { mode: PathMode; path: string; filePath: string | undefined; onChoose: Props["onChoose"] }) {
  if (mode === "folder") return <button type="button" className={styles.primary} onClick={() => onChoose(path)}>Use this folder</button>;
  if (!filePath) return null;

  return <button type="button" className={styles.primary} onClick={() => onChoose(filePath)}>Use this file</button>;
}
