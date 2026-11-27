import { useState } from "react";
import { subfolderPath } from "./folder-path";
import type { TestStartControls } from "./use-test-start";
import type { FolderListing } from "@/socket/studio-connection";

interface Props {
  controls: TestStartControls | undefined;
  workspace: string;
  onUse: (folder: string) => void;
}

export default function FolderPicker({ controls, workspace, onUse }: Props) {
  const [listing, setListing] = useState<FolderListing>();
  const [refusal, setRefusal] = useState<string>();
  const list = (path: string) =>
    void controls?.listFolder(path).then(
      (listed) => {
        setRefusal(undefined);
        setListing(listed);
      },
      (error: Error) => {
        setRefusal(error.message);
        setListing(undefined);
      },
    );

  return (
    <div>
      <button type="button" onClick={() => list(workspace || "/")}>Browse</button>
      {listing?.parent && <button type="button" onClick={() => list(listing.parent!)}>Up</button>}
      <section aria-label="Folders">
        {listing?.folders.map((folder) => (
          <button key={folder} type="button" onClick={() => list(subfolderPath(listing.path, folder))}>{folder}</button>
        ))}
      </section>
      {refusal && <p role="alert">{refusal}</p>}
      {listing && <button type="button" onClick={() => onUse(listing.path)}>Use this folder</button>}
    </div>
  );
}
