// The one HTTP server this app runs: a POST to a known path reaches its route, with the body read whole and capped. A route that throws is answered 502, since what it could not reach is upstream of it.
import { createServer, type IncomingMessage, type Server } from "node:http";

const HTTP_NOT_FOUND = 404;
const HTTP_TOO_LARGE = 413;
const HTTP_BAD_GATEWAY = 502;
/** GitHub caps a webhook's payload at 25 MB, and nothing else posted here is larger. */
const MAX_BODY_BYTES = 26_214_400;

export interface Answer {
  status: number;
  body?: unknown;
}

export type Route = (request: IncomingMessage, body: Buffer) => Promise<Answer>;

export type Routes = Partial<Record<string, Route>>;

export function buildHttpServer(routes: Routes, onError?: (error: unknown) => void): Server {
  return createServer((request, response) => {
    void answer(routes, request)
      .catch((error: unknown) => {
        onError?.(error);

        return { status: HTTP_BAD_GATEWAY };
      })
      .then((answered: Answer) => response.writeHead(answered.status, { "content-type": "application/json" }).end(JSON.stringify(answered.body)));
  });
}

async function answer(routes: Routes, request: IncomingMessage): Promise<Answer> {
  const route = request.method === "POST" ? routes[request.url ?? ""] : undefined;

  if (!route) return { status: HTTP_NOT_FOUND };
  const body = await bodyOf(request);

  return body ? route(request, body) : { status: HTTP_TOO_LARGE };
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

export function headerOf(request: IncomingMessage, name: string): string | undefined {
  const given = request.headers[name];

  return typeof given === "string" ? given : undefined;
}

export function jsonOf(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString());
  } catch {
    return null;
  }
}
