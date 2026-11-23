import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { WebSocket } from "ws";

afterEach(cleanup);

// jsdom has no matchMedia; this stands in for an operating system with the light scheme and no preferences.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), { matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined }) as MediaQueryList;
}

// Under jsdom the WebSocket is jsdom's, which fires events of a class vitest has replaced and so fails on open. The page is given the `ws` client instead: a real implementation of the same API.
if (typeof window !== "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
