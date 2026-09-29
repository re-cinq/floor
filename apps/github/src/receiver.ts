// The webhook receiver: GitHub posts here, and what it posts becomes a floor event. It checks the signature before it reads a word, and holds nothing: a delivery it could not hand to the floor is answered 502, and GitHub sends it again.
import type { IncomingMessage, Server } from "node:http";
import { floorEventOf, type FloorEvent } from "./floor-event.js";
import { buildHttpServer, headerOf, jsonOf, type Answer, type Route } from "./http.js";
import { isSignedBy } from "./signature.js";

const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
export const WEBHOOK_PATH = "/webhooks/github";

export interface ReceiverDeps {
  webhookSecret: string;
  post: (event: FloorEvent) => Promise<void>;
  onError?: (error: unknown) => void;
}

export function buildReceiver(deps: ReceiverDeps): Server {
  return buildHttpServer({ [WEBHOOK_PATH]: webhookRoute(deps) }, deps.onError);
}

export function webhookRoute(deps: ReceiverDeps): Route {
  return async (request, body) => {
    if (!isSignedBy(deps.webhookSecret, body, headerOf(request, "x-hub-signature-256"))) return { status: HTTP_UNAUTHORIZED };

    return handOver(deps, deliveryOf(request, body));
  };
}

function deliveryOf(request: IncomingMessage, body: Buffer): Parameters<typeof floorEventOf>[0] {
  return { event: headerOf(request, "x-github-event") ?? "", id: headerOf(request, "x-github-delivery") ?? "", body: jsonOf(body) };
}

async function handOver(deps: ReceiverDeps, delivery: Parameters<typeof floorEventOf>[0]): Promise<Answer> {
  const event = floorEventOf(delivery);

  if (!event) return { status: HTTP_NO_CONTENT };
  await deps.post(event);

  return { status: HTTP_ACCEPTED };
}
