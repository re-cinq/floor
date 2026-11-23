import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// jsdom has no matchMedia; this stands in for an operating system with the light scheme and no preferences.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), { matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined }) as MediaQueryList;
}
