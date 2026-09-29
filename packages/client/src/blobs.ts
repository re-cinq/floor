// Bytes the floor keeps by their hash, and the conversation archive a visit hands on. Uint8Array both ways: a published signature should not need node's Buffer.
import type { BlobRef } from "@re-cinq/floor-contracts";
import { asked, askedForBytes, type Reachable } from "./send.js";

const HTTP_NOT_FOUND = 404;
const OCTET_STREAM = "application/octet-stream";
const GZIP = "application/gzip";

export interface StoredBytes {
  bytes: Uint8Array;
  contentType: string;
}

export interface BlobsApi {
  get(hash: string): Promise<StoredBytes | null>;
  put(bytes: Uint8Array, contentType?: string): Promise<BlobRef>;
  /** A file need names an absolute url a pod can reach; a worker elsewhere reads the path off it and asks its own floor. */
  atUrl(url: string): Promise<StoredBytes | null>;
}

export function blobsApi(floor: Reachable): BlobsApi {
  return {
    get: (hash) => askedForBytes(floor, { method: "GET", path: `/blobs/${hash}` }, [HTTP_NOT_FOUND]),
    put: async (bytes, contentType) => (await asked<BlobRef>(floor, { method: "POST", path: "/blobs", bytes: { content: bytes, contentType: contentType ?? OCTET_STREAM } }))!,
    atUrl: (url) => askedForBytes(floor, { method: "GET", path: new URL(url).pathname }, [HTTP_NOT_FOUND]),
  };
}

export interface ConversationApi {
  /** The archive the named visit saved, for the one visit opened to continue it. */
  restore(savedBy: string): Promise<Uint8Array | null>;
  save(visitId: string, archive: Uint8Array): Promise<BlobRef>;
}

export function conversationApi(floor: Reachable): ConversationApi {
  return {
    restore: async (savedBy) => (await askedForBytes(floor, { method: "GET", path: `/conversations/${savedBy}` }, [HTTP_NOT_FOUND]))?.bytes ?? null,
    save: async (visitId, archive) => (await asked<BlobRef>(floor, { method: "POST", path: `/conversations/${visitId}`, bytes: { content: archive, contentType: GZIP } }))!,
  };
}
