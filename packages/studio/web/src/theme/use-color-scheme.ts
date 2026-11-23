import { useCallback, useEffect, useState } from "react";
import { parseSchemePref, resolveColorScheme, SCHEME_KEY, type ResolvedScheme, type SchemePref } from "./scheme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function useColorScheme(): { pref: SchemePref; choose: (pref: SchemePref) => void } {
  const [pref, setPref] = useState<SchemePref>(remembered);

  useEffect(() => {
    applyScheme(pref);
    const system = matchMedia(DARK_QUERY);
    const follow = () => applyScheme(pref);

    system.addEventListener("change", follow);

    return () => system.removeEventListener("change", follow);
  }, [pref]);

  const choose = useCallback((next: SchemePref) => {
    remember(next);
    setPref(next);
  }, []);

  return { pref, choose };
}

// Storage can be missing or refuse, in a private window or with site data blocked: the choice then lasts for the visit only.
function remembered(): SchemePref {
  try {
    return parseSchemePref(localStorage.getItem(SCHEME_KEY));
  } catch {
    return "auto";
  }
}

function remember(pref: SchemePref): void {
  try {
    localStorage.setItem(SCHEME_KEY, pref);
  } catch {
    return;
  }
}

function applyScheme(pref: SchemePref): void {
  const system: ResolvedScheme = matchMedia(DARK_QUERY).matches ? "dark" : "light";

  document.documentElement.setAttribute("data-color-scheme", resolveColorScheme(pref, system));
}
