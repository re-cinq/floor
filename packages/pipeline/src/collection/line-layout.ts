// Which line files a collection reads, decided from paths alone: a line held twice in one folder, a line folder used as a group, and a second folder for one line name are refused.
import { enforce } from "./enforce.js";
import { FORMER_LINE_FILE, LINE_FILE, lineFilePlaceOf, type CollectionFile, type LineFilePlace } from "./paths.js";
import { attempt, type Refusal } from "./refusal.js";

/** A line file of a collection, with its place: the line's name and the group folder it may sit in. */
export type LineFile = CollectionFile & LineFilePlace;

/** The line files a collection reads, in the order lines are put to the host, and the refusals of the rest. */
export interface LineLayout {
  read: LineFile[];
  refused: Refusal[];
}

/** The line files a collection reads, and the ones its layout refuses, decided from paths alone. */
export function lineLayoutOf(files: readonly CollectionFile[]): LineLayout {
  const lineFiles = lineFilesOf(files);
  const superseded = supersededBy(lineFiles);
  const lineFolders = new Set(lineFiles.map((file) => file.folderPath));
  const setBy = new Map<string, string>();
  const read: LineFile[] = [];
  const refused: Refusal[] = [];

  for (const file of lineFiles) {
    const result = attempt(file.path, () => {
      enforce(!superseded.has(file.path), `the folder ${file.folder} holds its line twice: ${LINE_FILE} is read, so remove ${FORMER_LINE_FILE}`);

      enforce(file.group === undefined || !lineFolders.has(file.group), `the folder ${file.group} holds a line, so it is not a group: move ${file.folder} out of it`);

      enforce(!setBy.has(file.folder), `${file.folder} is already set by ${setBy.get(file.folder)}`);
      setBy.set(file.folder, file.path);
    });

    if ("refusal" in result) {
      refused.push(result.refusal);
      continue;
    }

    read.push(file);
  }

  return { read, refused };
}

// The former name's file, in a folder that holds the line under its name too: two files would be two versions of one line.
function supersededBy(lineFiles: readonly LineFile[]): Set<string> {
  const named = new Set(lineFiles.filter((file) => file.path.endsWith(`/${LINE_FILE}`)).map((file) => file.folderPath));
  const former = lineFiles.filter((file) => file.path.endsWith(`/${FORMER_LINE_FILE}`) && named.has(file.folderPath));

  return new Set(former.map((file) => file.path));
}

function lineFilesOf(files: readonly CollectionFile[]): LineFile[] {
  return files
    .flatMap((file) => {
      const place = lineFilePlaceOf(file.path);

      return place ? [{ ...file, ...place }] : [];
    })
    .sort(byLineNameThenPath);
}

// By line name, not path, so a line moved into a group folder keeps its place in the order lines are put to the host; among files of one name, path order decides which is read.
function byLineNameThenPath(left: LineFile, right: LineFile): number {
  return left.folder.localeCompare(right.folder) || left.path.localeCompare(right.path);
}
