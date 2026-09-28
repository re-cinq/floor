// Content-addressed bytes (docs/api_sketch.md, "Blobs"). GET has no size limit beyond the store's own; POST caps at BlobsStore's MAX_BLOB_BYTES.
import type { Server } from "@hapi/hapi";
import { MAX_BLOB_BYTES } from "@floor/store";
import type { Credentials } from "../auth.js";
import type { Deps } from "../deps.js";
import { HTTP_CREATED } from "../http-status.js";
import { badRequest, notFound } from "../problem.js";

export function registerBlobRoutes(server: Server, deps: Deps): void {
  server.route({
    method: "GET",
    path: "/blobs/{hash}",
    handler: async (request, toolkit) => {
      const hash = request.params.hash as string;
      const covered = await covers(deps, request.auth.credentials as Credentials, hash);
      const blob = covered ? await deps.blobs.get(hash) : null;

      if (!blob) return notFound(toolkit, `no blob "${hash}"`);

      return toolkit.response(blob.bytes).type(blob.contentType ?? "application/octet-stream");
    },
  });

  server.route({
    method: "POST",
    path: "/blobs",
    options: { payload: { parse: false, maxBytes: MAX_BLOB_BYTES } },
    handler: async (request, toolkit) => {
      const raw = request.payload as Buffer;

      try {
        const contentType = request.headers["content-type"];

        return toolkit.response(await deps.blobs.put(raw, typeof contentType === "string" ? contentType : undefined)).code(HTTP_CREATED);
      } catch (error) {
        return badRequest(toolkit, error instanceof Error ? error.message : "could not store the blob");
      }
    },
  });
}

const NOTED_UPLOADS = 200;

// A service reads any blob. A visit reads the files it was given and the ones it has itself uploaded, and is told of no other that it exists.
async function covers(deps: Deps, credentials: Credentials, hash: string): Promise<boolean> {
  if (credentials.kind !== "visit") return true;
  const given = await deps.briefs.briefFor(credentials.visitId, deps.config.baseUrl);
  const needs = given?.needs ?? [];

  if (needs.some((need) => need.kind === "file" && need.url.endsWith(`/blobs/${hash}`))) return true;
  const uploads = await deps.records.list(credentials.visitId, "produced", { limit: NOTED_UPLOADS });

  return uploads.items.some((upload) => (upload.body as { ref?: string }).ref === hash);
}
