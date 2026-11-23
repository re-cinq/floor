// The rendered size of one element, followed as it resizes: the viewport fits the drawing to it, and the graph picks its wrap from it (run-viz FR4.1a). Null until measured — on the server and in a browser without ResizeObserver — which the graph reads as "one row".
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Size } from "./viewport";

export function useElementSize<T extends Element>(): [
  RefObject<T | null>,
  Size | null,
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
