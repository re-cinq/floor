// The built page as static files over plain HTTP on the loopback address: nothing but the files under one folder, and never cached, so a rebuilt page is the page.
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";

const LOOPBACK = "127.0.0.1";
const SUCCESS = 200;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const NOT_ALLOWED = 405;
const NOT_BUILT = 503;

const HTML = "text/html; charset=utf-8";
const CONTENT_TYPES: Record<string, string> = {
  ".html": HTML,
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const NOT_BUILT_PAGE = "<!doctype html><title>floor-studio</title><p>The page is not built. Build it with <code>npm run build</code> in packages/studio, then reload.</p>";

export interface PageServer {
  /** `http://127.0.0.1:<port>`: what a browser sends as Origin from this page. */
  origin: string;
  close(): Promise<void>;
}

interface PageAnswer {
  status: number;
  contentType: string;
  body: string | Buffer;
}

export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
}

export async function startPageServer(root: string): Promise<PageServer> {
  const server = createServer((request, response) => void respond(root, request, response));

  await new Promise<void>((listening) => server.listen(0, LOOPBACK, listening));

  return {
    origin: `http://${LOOPBACK}:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((closed) => (server.closeAllConnections(), server.close(() => closed()))),
  };
}

async function respond(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const answer = await pageAnswer(root, request);

  response.writeHead(answer.status, { "Content-Type": answer.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(request.method === "HEAD" ? undefined : answer.body);
}

async function pageAnswer(root: string, request: IncomingMessage): Promise<PageAnswer> {
  if (request.method !== "GET" && request.method !== "HEAD") return plain(NOT_ALLOWED, "only GET and HEAD");
  const folder = await realpath(root).catch(() => undefined);

  return folder ? servedFrom(folder, request.url ?? "/") : { status: NOT_BUILT, contentType: HTML, body: NOT_BUILT_PAGE };
}

async function servedFrom(folder: string, url: string): Promise<PageAnswer> {
  const wanted = decodedPath(url);

  if (wanted === undefined) return plain(BAD_REQUEST, "the path is not valid");
  const file = await fileWithin(folder, wanted);

  return file ? { status: SUCCESS, contentType: contentTypeOf(file.path), body: file.body } : plain(NOT_FOUND, "not found");
}

function plain(status: number, body: string): PageAnswer {
  return { status, contentType: "text/plain; charset=utf-8", body };
}

function decodedPath(url: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return undefined;
  }
}

// The path is resolved and its real location, symlinks followed, must sit inside the folder: neither `..` nor a link may lead out.
async function fileWithin(folder: string, wanted: string): Promise<{ path: string; body: Buffer } | undefined> {
  const asked = resolve(folder, `.${wanted.endsWith("/") ? `${wanted}index.html` : wanted}`);
  const real = await realpath(asked).catch(() => undefined);

  if (!real?.startsWith(`${folder}${sep}`)) return undefined;

  return (await stat(real)).isFile() ? { path: real, body: await readFile(real) } : undefined;
}
