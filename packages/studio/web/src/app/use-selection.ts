import { useCallback, useEffect, useState } from "react";
import { parseFragment, withExactSelection, type Selection } from "@/socket/fragment";

/** The selected line, node and tab live in the fragment, so a reload keeps the place; writing a selection replaces it whole, replaces the history entry and never touches `socket` or `token`. */
export function useSelection(): [Selection, (next: Selection) => void] {
  const [selection, setSelection] = useState<Selection>(selectionInAddress);

  useEffect(() => {
    const follow = () => setSelection(selectionInAddress());

    window.addEventListener("hashchange", follow);

    return () => window.removeEventListener("hashchange", follow);
  }, []);

  const select = useCallback((next: Selection) => {
    window.history.replaceState(null, "", withExactSelection(window.location.hash, next));
    setSelection(next);
  }, []);

  return [selection, select];
}

function selectionInAddress(): Selection {
  const { line, node, edge, tab } = parseFragment(window.location.hash);

  return { line, node, edge, tab };
}
