// The floor, as this tool reaches it: over HTTP, as a service, through the routes anything else would use.
const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_NOT_FOUND = 404;

export interface Floor {
  url: string;
  token: string;
}

export interface Asking {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
}

/** Null for what the floor does not have. Anything else it refuses is thrown, in the floor's own words. */
export async function asked<Answer>(floor: Floor, asking: Asking): Promise<Answer | null> {
  const response = await sent(floor, asking, asking.body === undefined ? undefined : { type: "application/json", bytes: JSON.stringify(asking.body) });

  if (response.status === HTTP_NOT_FOUND) return null;
  const answer = await response.text();

  return answer ? (JSON.parse(answer) as Answer) : null;
}

export async function blobStored(floor: Floor, bytes: Buffer): Promise<string> {
  const response = await sent(floor, { method: "POST", path: "/blobs" }, { type: "application/octet-stream", bytes: new Uint8Array(bytes) });
  const stored = (await response.json()) as { hash: string };

  return stored.hash;
}

export async function blobRead(floor: Floor, hash: string): Promise<Buffer> {
  const response = await sent(floor, { method: "GET", path: `/blobs/${hash}` });

  if (response.status === HTTP_NOT_FOUND) throw new Error(`the floor has no blob "${hash}", which a line names as its file`);

  return Buffer.from(await response.arrayBuffer());
}

interface Sent {
  type: string;
  bytes: string | Uint8Array<ArrayBuffer>;
}

async function sent(floor: Floor, asking: Asking, body?: Sent): Promise<Response> {
  const response = await fetch(`${floor.url}${asking.path}`, {
    method: asking.method,
    headers: { authorization: `Bearer ${floor.token}`, ...(body && { "content-type": body.type }) },
    body: body?.bytes,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.ok || response.status === HTTP_NOT_FOUND) return response;
  throw new Error(`the floor refused ${asking.method} ${asking.path} with ${response.status}: ${await response.text()}`);
}
