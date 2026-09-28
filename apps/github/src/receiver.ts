// The webhook receiver: GitHub posts here, and what it posts becomes a floor event. It checks the signature before it reads a word, and holds nothing: a delivery it could not hand to the floor is answered 502, and GitHub sends it again.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { floorEventOf, type FloorEvent } from "./floor-event.js";
import { isSignedBy } from "./signature.js";

const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_LARGE = 413;
const HTTP_BAD_GATEWAY = 502;
/** GitHub caps a webhook's payload at 25 MB. */
const MAX_BODY_BYTES = 26_214_400;
const PATH = "/webhooks/github";

export interface ReceiverDeps {
  webhookSecret: string;
  post: (event: FloorEvent) => Promise<void>;
  onError?: (error: unknown) => void;
}

export function buildReceiver(deps: ReceiverDeps): Server {
  return createServer((request, response) => {
    void answer(deps, request)
      .catch((error: unknown) => failed(deps, error))
      .then((status) => respond(response, status));
  });
}

function respond(response: ServerResponse, status: number): void {
  response.writeHead(status).end();
}

function failed(deps: ReceiverDeps, error: unknown): number {
  deps.onError?.(error);

  return HTTP_BAD_GATEWAY;
}

async function answer(deps: ReceiverDeps, request: IncomingMessage): Promise<number> {
  if (request.method !== "POST" || request.url !== PATH) return HTTP_NOT_FOUND;
  const body = await bodyOf(request);

  if (!body) return HTTP_TOO_LARGE;
  if (!isSignedBy(deps.webhookSecret, body, headerOf(request, "x-hub-signature-256"))) return HTTP_UNAUTHORIZED;

  return handOver(deps, deliveryOf(request, body));
}

function deliveryOf(request: IncomingMessage, body: Buffer): Parameters<typeof floorEventOf>[0] {
  return { event: headerOf(request, "x-github-event") ?? "", id: headerOf(request, "x-github-delivery") ?? "", body: jsonOf(body) };
}

async function handOver(deps: ReceiverDeps, delivery: Parameters<typeof floorEventOf>[0]): Promise<number> {
  const event = floorEventOf(delivery);

  if (!event) return HTTP_NO_CONTENT;

  try {
    await deps.post(event);

    return HTTP_ACCEPTED;
  } catch (error) {
    deps.onError?.(error);

    return HTTP_BAD_GATEWAY;
  }
}

/** Null for a body past the cap, which is dropped unread. */
async function bodyOf(request: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}

function headerOf(request: IncomingMessage, name: string): string | undefined {
  const given = request.headers[name];

  return typeof given === "string" ? given : undefined;
}

function jsonOf(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString());
  } catch {
    return null;
  }
}
