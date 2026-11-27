// What a folder on disk holds, by name: the answer to `folder.list`. Types only, so the protocol can import it.
export interface FolderListing {
  path: string;
  parent: string | null;
  folders: string[];
  files: string[];
}
