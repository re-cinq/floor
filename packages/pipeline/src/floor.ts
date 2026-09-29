// The floor, as this tool reaches it: the shared client, under the names this tool's own callers already use.
import { asked as askedOfFloor, createFloorClient, reach, serviceToken, type Asking } from "@re-cinq/floor-client";

const HTTP_NOT_FOUND = 404;

export interface Floor {
  url: string;
  token: string;
}

export type { Asking };

/** Null for what the floor does not have. Anything else it refuses is thrown, in the floor's own words. */
export async function asked<Answer>(floor: Floor, asking: Asking): Promise<Answer | null> {
  return askedOfFloor<Answer>(reachable(floor), asking, [HTTP_NOT_FOUND]);
}

export async function blobStored(floor: Floor, bytes: Buffer): Promise<string> {
  const stored = await askedOfFloor<{ hash: string }>(reachable(floor), { method: "POST", path: "/blobs", bytes: { content: new Uint8Array(bytes), contentType: "application/octet-stream" } });

  return stored!.hash;
}

// A line names its files by hash, so a hash the floor does not hold is a pipeline that cannot be read, not an absence to carry on past.
export async function blobRead(floor: Floor, hash: string): Promise<Buffer> {
  const { blobs } = clientFor(floor);
  const stored = await blobs.get(hash);

  if (!stored) throw new Error(`the floor has no blob "${hash}", which a line names as its file`);

  return Buffer.from(stored.bytes);
}

function reachable(floor: Floor) {
  return reach(floor.url, serviceToken(floor.token));
}

function clientFor(floor: Floor) {
  return createFloorClient({ url: floor.url, token: serviceToken(floor.token) });
}
