import { configure } from "@testing-library/react";
import { WebSocket } from "ws";
import "../../graph/vitest.setup";

// Page tests wait on a real backend and fake agents; in a full parallel run one second is sometimes not enough for a frame to arrive.
const PAGE_WAIT_MS = 3000;

configure({ asyncUtilTimeout: PAGE_WAIT_MS });

// Under jsdom the WebSocket is jsdom's, which fires events of a class vitest has replaced and so fails on open. The page is given the `ws` client instead: a real implementation of the same API.
if (typeof window !== "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

// jsdom has no HTMLDialogElement.showModal; opening is the `open` attribute.
if (typeof HTMLDialogElement !== "undefined" && !Reflect.has(HTMLDialogElement.prototype, "showModal")) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
