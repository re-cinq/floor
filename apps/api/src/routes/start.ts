// POST /assembly-lines/:id/start (docs/api_sketch.md): joins an already-open run on the same subject instead of starting a second one.
import type { Server } from "@hapi/hapi";
import { InvalidStart } from "@floor/store";
import type { Deps } from "../deps.js";
import { HTTP_CREATED, HTTP_OK } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest } from "../problem.js";
import { startRunSchema } from "../schemas.js";

export function registerStartRoute(server: Server, deps: Deps): void {
  server.route({
    method: "POST",
    path: "/assembly-lines/{id}/start",
    handler: async (request, toolkit) => {
      const parsed = parseBody(startRunSchema, request.payload);

      if (!parsed.success) return badRequest(toolkit, "invalid start request", parsed.errors);

      try {
        const result = await deps.runs.start({ lineId: request.params.id as string, ...parsed.value });

        return toolkit.response(result).code(result.joined ? HTTP_OK : HTTP_CREATED);
      } catch (error) {
        if (error instanceof InvalidStart) return badRequest(toolkit, "invalid start request", error.problems);

        return badRequest(toolkit, error instanceof Error ? error.message : "could not start the run");
      }
    },
  });
}
