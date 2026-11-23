// light, dark, or auto (follow the operating system), remembered in localStorage. The script in index.html repeats `SCHEME_KEY` and this resolution before first paint, so the page never flashes the wrong scheme.

export type SchemePref = "light" | "dark" | "auto";
export type ResolvedScheme = "light" | "dark";

export const SCHEME_KEY = "floor-studio-color-scheme";
export const SCHEME_PREFS: readonly SchemePref[] = ["light", "dark", "auto"];

export function parseSchemePref(raw: string | null): SchemePref {
  return SCHEME_PREFS.find((pref) => pref === raw) ?? "auto";
}

export function resolveColorScheme(pref: SchemePref, system: ResolvedScheme): ResolvedScheme {
  return pref === "auto" ? system : pref;
}
