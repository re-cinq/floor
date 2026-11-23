// What the page keeps in its URL fragment, which a browser never sends to a server: where the backend is and the token that opens it, and, so a reload keeps the place, the selected line and node.

export interface Selection {
  line?: string;
  node?: string;
}

export interface PageLocation extends Selection {
  socket?: string;
  token?: string;
}

const KNOWN_KEYS = ["socket", "token", "line", "node"] as const;

export function parseFragment(hash: string): PageLocation {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  const held = KNOWN_KEYS.map((key) => [key, params.get(key)] as const).filter(([, value]) => value);

  return Object.fromEntries(held) as PageLocation;
}

/** The fragment with the selection set, every other part, `socket` and `token` first, kept as it was. */
export function withSelection(hash: string, selection: Selection): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  for (const key of ["line", "node"] as const) {
    params.delete(key);

    if (selection[key]) params.set(key, selection[key]);
  }

  return `#${params.toString()}`;
}
