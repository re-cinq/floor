// The one place this package calls a floor. Everything else asks through here, so the bearer header, the timeout and the refusal are written once.
import { FloorProblem, problemOf } from "./problem.js";
import type { ServiceToken, VisitToken } from "./tokens.js";

const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_NO_CONTENT = 204;

export interface Reachable {
  /** Where the floor answers. A trailing slash is trimmed, so either spelling works. */
  url: string;
  token: ServiceToken | VisitToken;
  /** The seam a test injects. Left out, the global fetch is used. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export interface Asking {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Bytes instead of JSON, with the type they are stored under. */
  bytes?: { content: Uint8Array; contentType: string };
}

export function reach(url: string, token: ServiceToken | VisitToken, options: Omit<Reachable, "url" | "token"> = {}): Reachable {
  return { url: url.replace(/\/+$/, ""), token, ...options };
}

export async function send(floor: Reachable, asking: Asking): Promise<Response> {
  const call = floor.fetchFn ?? fetch;

  return call(`${floor.url}${asking.path}${queryOf(asking.query)}`, {
    method: asking.method,
    headers: headersFor(floor, asking),
    body: bodyOf(asking),
    signal: AbortSignal.timeout(floor.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });
}

/** The answer, or null for a status this caller reads as absence. Anything else the floor refused throws a FloorProblem. */
export async function asked<Answer>(floor: Reachable, asking: Asking, absent: number[] = []): Promise<Answer | null> {
  const response = await accepted(floor, asking, absent);

  if (!response) return null;
  const said = await response.text();

  return said ? (JSON.parse(said) as Answer) : null;
}

export async function askedForBytes(floor: Reachable, asking: Asking, absent: number[] = []): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const response = await accepted(floor, asking, absent);

  if (!response) return null;

  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

/** Nothing to read: the floor either did it or refused. */
export async function done(floor: Reachable, asking: Asking, absent: number[] = []): Promise<boolean> {
  return (await accepted(floor, asking, absent)) !== null;
}

async function accepted(floor: Reachable, asking: Asking, absent: number[]): Promise<Response | null> {
  const response = await send(floor, asking);

  if (absent.includes(response.status) || response.status === HTTP_NO_CONTENT) return null;
  if (response.ok) return response;

  throw new FloorProblem(await problemOf(response), asking);
}

function headersFor(floor: Reachable, asking: Asking): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${floor.token}` };
  const contentType = contentTypeOf(asking);

  if (contentType) headers["content-type"] = contentType;

  return headers;
}

// Bytes go up under the type they are stored as; a JSON body says so; a request with no body says nothing.
function contentTypeOf(asking: Asking): string | null {
  if (asking.bytes) return asking.bytes.contentType;

  return asking.body === undefined ? null : "application/json";
}

function bodyOf(asking: Asking): BodyInit | undefined {
  if (asking.bytes) return asking.bytes.content as BodyInit;

  return asking.body === undefined ? undefined : JSON.stringify(asking.body);
}

function queryOf(query: Asking["query"]): string {
  const stated = Object.entries(query ?? {}).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined);
  const search = new URLSearchParams(stated.map(([name, value]) => [name, String(value)]));

  return search.size > 0 ? `?${search.toString()}` : "";
}
