import { useEffect, useRef, useState } from "react";
import { subfolderPath } from "./folder-path";
import styles from "./path-picker.module.css";
import type { FolderListing } from "@/socket/studio-connection";

interface Props {
  startDir: string;
  list: (path: string) => Promise<FolderListing>;
  onChoose: (path: string) => void;
  onClose: () => void;
}

export default function PathPicker({ startDir, list, onChoose, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { listing, refusal, browse } = useFolderListing(list);

  useEffect(() => {
    dialogRef.current?.showModal();
    browse(startDir);
  }, []);

  return (
    <dialog ref={dialogRef} aria-label="Choose a folder" className={styles.dialog} onCancel={onClose}>
      <Listing listing={listing} browse={browse} />
      {refusal && <p role="alert">{refusal}</p>}
      {listing && <button type="button" onClick={() => onChoose(listing.path)}>Use this folder</button>}
      <button type="button" onClick={onClose}>Cancel</button>
    </dialog>
  );
}

function useFolderListing(list: Props["list"]) {
  const [listing, setListing] = useState<FolderListing>();
  const [refusal, setRefusal] = useState<string>();
  const browse = (path: string) =>
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

function Listing({ listing, browse }: { listing: FolderListing | undefined; browse: (path: string) => void }) {
  return (
    <>
      {listing && <code>{listing.path}</code>}
      {listing?.parent && <button type="button" onClick={() => browse(listing.parent!)}>Up</button>}
      <section aria-label="Folders">
        {listing?.folders.map((folder) => (
          <button key={folder} type="button" onClick={() => browse(subfolderPath(listing.path, folder))}>{folder}</button>
        ))}
      </section>
    </>
  );
}
