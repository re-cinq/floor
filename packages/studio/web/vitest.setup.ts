import { WebSocket } from "ws";
import "../../graph/vitest.setup";

// Under jsdom the WebSocket is jsdom's, which fires events of a class vitest has replaced and so fails on open. The page is given the `ws` client instead: a real implementation of the same API.
if (typeof window !== "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
