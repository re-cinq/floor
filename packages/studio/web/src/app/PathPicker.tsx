import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ALL_FILES, matchesMask, type FileMask } from "./file-mask";
import { childPath } from "./folder-path";
import { completedTyped, enterAction, shownEntries, type EnterAction, splitTyped } from "./path-completion";
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
  const mask = [...masks, ALL_FILES][maskIndex]!;

  useEffect(() => {
    dialogRef.current?.showModal();
    browse(startDir);
  }, []);

  const offeredFile = offeredPath(pickedPath, listing, mask);
  const titleId = useId();
  const pickFile = mode === "file" && listing ? (name: string) => setPickedPath(childPath(listing.path, name)) : undefined;
  const { typed, openFolder, changeTyped } = usePathBar(listing, browse);
  const shown = shownEntries(listing, splitTyped(typed).filter, shownMask(mode, mask));

  const onEnter = () => listing && applyEnter(enterAction(mode, splitTyped(typed).filter, shown), { path: listing.path, typed, onChoose, changeTyped });

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className={styles.dialog} onCancel={onClose}>
      <h2 id={titleId} className={styles.title}>Choose a {mode}</h2>
      <Toolbar listing={listing} openFolder={openFolder} typed={typed} onType={changeTyped} onComplete={() => changeTyped(completedTyped(typed, shown))} onEnter={onEnter} />
      {refusal && <p role="alert" className={styles.refusal}>{refusal}</p>}
      <PathPickerList listing={listing} browse={openFolder} pickFile={pickFile} pickedPath={offeredFile} shown={shown} />
      <Footer mode={mode} masks={masks} maskIndex={maskIndex} chooseMask={setMaskIndex} onClose={onClose}>
        {listing && <Choice mode={mode} path={listing.path} filePath={offeredFile} onChoose={onChoose} />}
      </Footer>
    </dialog>
  );
}

interface ToolbarProps {
  listing: FolderListing | undefined;
  openFolder: (path: string) => void;
  typed: string;
  onType: (typed: string) => void;
  onComplete: () => void;
  onEnter: () => void;
}

function Toolbar({ listing, openFolder, typed, onType, onComplete, onEnter }: ToolbarProps) {
  const parent = listing?.parent;

  return (
    <div className={styles.toolbar}>
      {parent && <button type="button" className={styles.up} aria-label="Up" onClick={() => openFolder(parent)}><UpIcon /></button>}
      <input type="text" aria-label="Path" className={styles.pathBar} value={typed} onChange={(event) => onType(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter();
        }

        if (event.key !== "Tab" || event.shiftKey) return;
        event.preventDefault();
        onComplete();
      }} />
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

function usePathBar(listing: FolderListing | undefined, browse: (path?: string) => void) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (listing) setTyped((current) => current === "" ? withSlash(listing.path) : current);
  }, [listing]);

  const openFolder = (path: string) => {
    setTyped(withSlash(path));
    browse(path);
  };

  const changeTyped = (next: string) => {
    const { folder } = splitTyped(next);
    if (folder !== splitTyped(typed).folder) browse(folder || undefined);
    setTyped(next);
  };

  return { typed, openFolder, changeTyped };
}

interface EnterContext {
  path: string;
  typed: string;
  onChoose: Props["onChoose"];
  changeTyped: (typed: string) => void;
}

const ENTER_HANDLERS: Record<EnterAction["kind"], (context: EnterContext, action: EnterAction) => void> = {
  chooseFile: ({ path, onChoose }, action) => action.kind === "chooseFile" && onChoose(childPath(path, action.name)),
  chooseFolder: ({ path, onChoose }) => onChoose(path),
  openFolder: ({ typed, changeTyped }) => changeTyped(`${typed}/`),
  none: () => undefined,
};

function applyEnter(action: EnterAction, context: EnterContext) {
  ENTER_HANDLERS[action.kind](context, action);
}

function shownMask(mode: PathMode, mask: FileMask): FileMask | undefined {
  return mode === "file" ? mask : undefined;
}

function withSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
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
