// What the page keeps in its URL fragment, which a browser never sends to a server: where the backend is and the token that opens it, and, so a reload keeps the place, the selected line and node.

export interface Selection {
  line?: string;
  node?: string;
  tab?: string;
}

export interface PageLocation extends Selection {
  socket?: string;
  token?: string;
}

const SELECTION_KEYS = ["line", "node", "tab"] as const;
const KNOWN_KEYS = ["socket", "token", ...SELECTION_KEYS] as const;

export function parseFragment(hash: string): PageLocation {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  const held = KNOWN_KEYS.map((key) => [key, params.get(key)] as const).filter(([, value]) => value);

  return Object.fromEntries(held) as PageLocation;
}

/** The fragment with the line and node set and the tab kept unless a new one is given; every other part, `socket` and `token` first, kept as it was. */
export function withSelection(hash: string, selection: Selection): string {
  return withExactSelection(hash, { ...selection, tab: selection.tab ?? parseFragment(hash).tab });
}

/** The fragment holding exactly the given selection: a part the selection leaves out is removed; every other part kept as it was. */
export function withExactSelection(hash: string, selection: Selection): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  for (const key of SELECTION_KEYS) {
    const value = selection[key];

    if (!value) params.delete(key);

    if (value) params.set(key, value);
  }

  return `#${params.toString()}`;
}
