import { useCallback, useEffect, useState } from "react";
import { parseFragment, withSelection, type Selection } from "@/socket/fragment";

/** The selected line and node live in the fragment, so a reload keeps the place; writing one replaces the history entry and never touches `socket` or `token`. */
export function useSelection(): [Selection, (next: Selection) => void] {
  const [selection, setSelection] = useState<Selection>(selectionInAddress);

  useEffect(() => {
    const follow = () => setSelection(selectionInAddress());

    window.addEventListener("hashchange", follow);

    return () => window.removeEventListener("hashchange", follow);
  }, []);

  const select = useCallback((next: Selection) => {
    window.history.replaceState(null, "", withSelection(window.location.hash, next));
    setSelection(next);
  }, []);

  return [selection, select];
}

function selectionInAddress(): Selection {
  const { line, node } = parseFragment(window.location.hash);

  return { line, node };
}
