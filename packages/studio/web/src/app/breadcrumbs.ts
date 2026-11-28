import type { Selection } from "@/socket/fragment";

export interface Crumb {
  label: string;
  selection?: Selection;
}

export interface TrailInput {
  collectionName: string;
  line: string | undefined;
  test: string | undefined;
  runFolderName: string | undefined;
}

export function crumbsOf({ collectionName, line, test, runFolderName }: TrailInput): Crumb[] {
  const collection = { label: collectionName, selection: {} };
  const path = line ? [collection, ...lineTrail(line, test, runFolderName)] : [collection];

  return path.map((crumb, index) => (index === path.length - 1 ? { label: crumb.label } : crumb));
}

function lineTrail(line: string, test: string | undefined, runFolderName: string | undefined): Crumb[] {
  const lineCrumb = { label: line, selection: { line } };
  const testing = { label: "Test locally", selection: { line, test: "new" } };

  if (!test) return [lineCrumb];

  return test === "new" ? [lineCrumb, testing] : [lineCrumb, testing, { label: runFolderName ?? test }];
}

export function folderNameOfRun(listings: { run: string; folder: string }[], run: string | undefined): string | undefined {
  const folder = listings.find((listing) => listing.run === run)?.folder;

  return folder?.split("/").pop();
}
