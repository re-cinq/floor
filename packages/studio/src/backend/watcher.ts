// Changes under a collection's folder, as one notification after the editor has finished: an editor saves with several writes and a rename.
import { watch } from "node:fs";
import { sep } from "node:path";
import { isReadPath } from "@re-cinq/floor-pipeline";

const DEBOUNCE_MS = 100;

export interface CollectionWatcher {
  close(): void;
}

/** A path the collection reads, and not under a dot folder: `.floor-studio` and `.git` change all the time and are not the collection's. */
export function isWatchedPath(path: string): boolean {
  const slashed = path.split(sep).join("/");

  return isReadPath(slashed) && !slashed.split("/").some((part) => part.startsWith("."));
}

export function watchCollection(dir: string, onChange: () => void, debounceMs = DEBOUNCE_MS): CollectionWatcher {
  let timer: NodeJS.Timeout | undefined;

  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };

  const watcher = watch(dir, { recursive: true }, (...given) => {
    const filename = given[1];

    // A name the platform leaves out may be any file.
    if (filename === null || isWatchedPath(filename)) changed();
  });

  // A folder removed under the watcher ends it with an error; the studio keeps answering its sockets, and a read says what is gone.
  watcher.on("error", () => undefined);

  return {
    close: () => {
      clearTimeout(timer);
      watcher.close();
    },
  };
}
