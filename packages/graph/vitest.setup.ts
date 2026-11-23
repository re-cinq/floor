import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// jsdom has no matchMedia; this stands in for an operating system with the light scheme and no preferences.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), { matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined }) as MediaQueryList;
}

// jsdom has no ResizeObserver; this stands in for a browser that reports an element's laid-out box once, when observing starts.
if (typeof window !== "undefined" && typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(private readonly onResize: ResizeObserverCallback) {}

    observe(element: Element): void {
      const entry = { target: element, contentRect: element.getBoundingClientRect() } as ResizeObserverEntry;

      this.onResize([entry], this);
    }

    unobserve(): void {}

    disconnect(): void {}
  };
}
