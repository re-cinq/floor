// Content-addressed bytes (docs/api_sketch.md, "Blobs"). GET has no size limit beyond the store's own; POST caps at BlobsStore's MAX_BLOB_BYTES.
import type { Server } from "@hapi/hapi";
import { MAX_BLOB_BYTES } from "@floor/store";
import type { Deps } from "../deps.js";
import { HTTP_CREATED } from "../http-status.js";
import { badRequest, notFound } from "../problem.js";

export function registerBlobRoutes(server: Server, deps: Deps): void {
  server.route({
    method: "GET",
    path: "/blobs/{hash}",
    handler: async (request, toolkit) => {
      const blob = await deps.blobs.get(request.params.hash as string);

      if (!blob) return notFound(toolkit, `no blob "${request.params.hash}"`);

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
