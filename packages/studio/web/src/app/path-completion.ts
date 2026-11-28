// Filters a folder's entry names the way a shell completes a typed prefix.

import { matchesMask, type FileMask } from "./file-mask";
import type { FolderListing } from "@/socket/studio-connection";

export interface ShownEntries {
  folders: string[];
  files: string[];
}

export function shownEntries(listing: FolderListing | undefined, filter: string, mask: FileMask | undefined): ShownEntries {
  const files = mask ? (listing?.files ?? []).filter((file) => matchesMask(file, mask.patterns)) : [];

  return { folders: entriesMatching(listing?.folders ?? [], filter), files: entriesMatching(files, filter) };
}

export function entriesMatching(names: string[], filter: string): string[] {
  const prefix = filter.toLowerCase();
  const candidates = filter.startsWith(".") ? names : names.filter((name) => !name.startsWith("."));

  const prefixMatches = candidates.filter((name) => name.toLowerCase().startsWith(prefix));

  if (prefixMatches.length > 0) return prefixMatches;

  return candidates.filter((name) => name.toLowerCase().includes(prefix));
}

export function splitTyped(typed: string): { folder: string; filter: string } {
  const lastSlash = typed.lastIndexOf("/");
  const isInRoot = lastSlash === 0;
  const hasFolder = lastSlash !== -1;
  const folder = hasFolder ? typed.slice(0, lastSlash) : "";

  return { folder: isInRoot ? "/" : folder, filter: typed.slice(lastSlash + 1) };
}

export function completedFilter(matches: string[], filter: string): string {
  if (matches.length === 0) return filter;

  const prefixLength = matches.reduce((shortest, name) => Math.min(shortest, commonPrefixLength(matches[0], name)), matches[0].length);

  return prefixLength < filter.length ? filter : matches[0].slice(0, prefixLength);
}

export function completedTyped(typed: string, shown: ShownEntries): string {
  const { filter } = splitTyped(typed);
  const completed = completedFilter([...shown.folders, ...shown.files], filter);
  const slash = shown.folders.includes(completed) ? "/" : "";

  return typed.slice(0, typed.length - filter.length) + completed + slash;
}

export type EnterAction = { kind: "chooseFile"; name: string } | { kind: "openFolder" } | { kind: "chooseFolder" } | { kind: "none" };

export function enterAction(mode: "file" | "folder", filter: string, shown: ShownEntries): EnterAction {
  if (mode === "file" && shown.files.includes(filter)) return { kind: "chooseFile", name: filter };
  if (shown.folders.includes(filter)) return { kind: "openFolder" };
  if (mode === "folder" && filter === "") return { kind: "chooseFolder" };

  return { kind: "none" };
}

function commonPrefixLength(left: string, right: string): number {
  let length = 0;

  while (length < left.length && left[length].toLowerCase() === right.charAt(length).toLowerCase()) length++;

  return length;
}
