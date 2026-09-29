import type { Item } from "./types.js";

// Only values: a file's ref is a blob hash and may point at large or private content.
export function valueArgsOf(startItems: Record<string, Item>): Record<string, string> {
  const valueEntries = Object.entries(startItems).filter(([, startItem]) => startItem.kind === "value");

  return Object.fromEntries(valueEntries.map(([name, startItem]) => [name, startItem.ref]));
}
