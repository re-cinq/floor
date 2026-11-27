import type { AddressInfo } from "node:net";
import { waitFor } from "@testing-library/react";
import { WebSocket, WebSocketServer } from "ws";

export interface SocketRelay {
  /** Aims the relay at a studio and returns the address a page should use to reach it through the relay. */
  through: (studio: { url: string }) => string;
  /** How many page sockets the relay has let through, never counting the ones it refused. */
  accepted: () => number;
  /** Closes every relayed pair and refuses page sockets until `mend`. */
  cut: () => void;
  mend: () => void;
  close: () => Promise<void>;
}

const REFUSED_CODE = 1013;
const UNTIL_RELAYED_MS = 10_000;

interface Held {
  content: WebSocket.RawData;
  isBinary: boolean;
}

interface Pair {
  page: WebSocket;
  studio: WebSocket;
}

interface RelayState {
  pairs: Set<Pair>;
  isCut: boolean;
  accepted: number;
  studioUrl: string;
}

// A man in the middle for the page's socket: the studio keeps running while the page is cut off from it and, once mended, reconnects through the same address.
export async function startSocketRelay(): Promise<SocketRelay> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const state: RelayState = { pairs: new Set(), isCut: false, accepted: 0, studioUrl: "" };

  await new Promise<void>((resolve) => server.once("listening", resolve));
  server.on("connection", (page, request) => relay(state, page, request.url ?? "/"));

  const { port } = server.address() as AddressInfo;

  return {
    through: (studio) => {
      state.studioUrl = studio.url;

      return `ws://127.0.0.1:${port}`;
    },
    accepted: () => state.accepted,
    cut: () => cutAll(state),
    mend: () => {
      state.isCut = false;
    },
    close: () => closeServer(server),
  };
}

export async function untilRelayed(relay: SocketRelay, count: number): Promise<void> {
  await waitFor(() => (relay.accepted() >= count ? undefined : Promise.reject(new Error(`the relay has let ${relay.accepted()} page sockets through`))), { timeout: UNTIL_RELAYED_MS });
}

function relay(state: RelayState, page: WebSocket, path: string): void {
  if (state.isCut) return page.close(REFUSED_CODE);
  state.accepted += 1;
  const studio = new WebSocket(new URL(path, state.studioUrl));

  state.pairs.add({ page, studio });
  relayBetween(page, studio);
}

function cutAll(state: RelayState): void {
  state.isCut = true;
  state.pairs.forEach(({ page, studio }) => {
    page.terminate();
    studio.terminate();
  });
  state.pairs.clear();
}

function closeServer(server: WebSocketServer): Promise<void> {
  return new Promise((resolve) => {
    server.clients.forEach((client) => client.terminate());
    server.close(() => resolve());
  });
}

function relayBetween(page: WebSocket, studio: WebSocket): void {
  const waiting: Held[] = [];
  const send = ({ content, isBinary }: Held) => studio.send(content, { binary: isBinary });

  page.on("message", (content, isBinary) => (studio.readyState === WebSocket.OPEN ? send({ content, isBinary }) : waiting.push({ content, isBinary })));
  studio.on("open", () => waiting.splice(0).forEach(send));
  studio.on("message", (content, isBinary) => page.send(content, { binary: isBinary }));
  page.on("close", () => studio.close());
  studio.on("close", () => page.close());
  studio.on("error", () => page.close());
  page.on("error", () => studio.close());
}
