// Filters a folder's entry names the way a shell completes a typed prefix.

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

function commonPrefixLength(left: string, right: string): number {
  let length = 0;

  while (length < left.length && left[length].toLowerCase() === right.charAt(length).toLowerCase()) length++;

  return length;
}
