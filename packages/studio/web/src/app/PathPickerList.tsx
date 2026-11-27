import { ALL_FILES, matchesMask, type FileMask } from "./file-mask";
import { childPath } from "./folder-path";
import { FileIcon, FolderIcon } from "./icons";
import styles from "./path-picker.module.css";
import type { FolderListing } from "@/socket/studio-connection";

interface Props {
  listing: FolderListing | undefined;
  browse: (path: string) => void;
  pickFile: ((file: string) => void) | undefined;
  pickedPath: string | undefined;
  mask: FileMask;
}

export default function PathPickerList({ listing, browse, pickFile, pickedPath, mask }: Props) {
  return (
    <div className={styles.list}>
      <section aria-label="Folders">
        {listing?.folders.map((folder) => (
          <button key={folder} type="button" className={styles.row} onClick={() => browse(childPath(listing.path, folder))}>
            <FolderIcon />
            {folder}
          </button>
        ))}
      </section>
      {pickFile && <Files listing={listing} pick={pickFile} pickedPath={pickedPath} mask={mask} />}
    </div>
  );
}

interface FilesProps {
  listing: FolderListing | undefined;
  pick: (file: string) => void;
  pickedPath: string | undefined;
  mask: FileMask;
}

function Files({ listing, pick, pickedPath, mask }: FilesProps) {
  const shown = (listing?.files ?? []).filter((file) => matchesMask(file, mask.patterns));
  const isPicked = (file: string) => !!listing && childPath(listing.path, file) === pickedPath;

  return (
    <section aria-label="Files">
      {shown.map((file) => (
        <button key={file} type="button" className={styles.row} aria-pressed={isPicked(file)} onClick={() => pick(file)}>
          <FileIcon />
          {file}
        </button>
      ))}
    </section>
  );
}

export function MaskSelect({ masks, maskIndex, chooseMask }: { masks: FileMask[]; maskIndex: number; chooseMask: (index: number) => void }) {
  return (
    <select aria-label="Show files" value={maskIndex} onChange={(event) => chooseMask(Number(event.target.value))}>
      {[...masks, ALL_FILES].map(({ label }, index) => (
        <option key={label} value={index}>{label}</option>
      ))}
    </select>
  );
}
