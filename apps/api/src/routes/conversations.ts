// Conversation archives, in the shape the ai-agent-subsystem speaks: it saves one with POST {source}/{pin} and restores one with GET {source}/{id}, both ids being visit ids. The bytes are a blob like any other.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import { MAX_ARCHIVE_BYTES, Refusal } from "@floor/store";
import type { Credentials } from "../auth.js";
import type { Deps } from "../deps.js";
import { HTTP_CREATED } from "../http-status.js";
import { badRequest, forbidden, notFound } from "../problem.js";
import { forOwnVisit, isUuid } from "./own-visit.js";

export function registerConversationRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/conversations/{id}", handler: (request, toolkit) => restore(deps, request, toolkit) });
  server.route({
    method: "POST",
    path: "/conversations/{id}",
    options: { payload: { parse: false, maxBytes: MAX_ARCHIVE_BYTES } },
    handler: forOwnVisit((visitId, request, toolkit) => save(deps, { visitId, archive: request.payload as Buffer }, toolkit)),
  });
}

async function save(deps: Deps, saved: { visitId: string; archive: Buffer }, toolkit: ResponseToolkit) {
  const visitId = saved.visitId;

  if (!(await openVisit(deps, visitId))) return notFound(toolkit, `no open station run "${visitId}" to save a conversation for`);

  try {
    const stored = await deps.blobs.putArchive(saved.archive);

    await deps.records.append(visitId, [{ kind: "session", body: { ref: stored.hash }, occurredAt: deps.now() }]);

    return toolkit.response(stored).code(HTTP_CREATED);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;

    return badRequest(toolkit, error.message);
  }
}

async function openVisit(deps: Deps, visitId: string) {
  const visit = isUuid(visitId) ? await deps.runs.visit(visitId) : null;

  return visit && !visit.report ? visit : null;
}

async function restore(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const savedBy = request.params.id as string;
  const sessionRef = await sessionSavedBy(deps, savedBy);

  if (!sessionRef) return notFound(toolkit, `station run "${savedBy}" saved no conversation`);
  if (!(await mayRestore(deps, request.auth.credentials as Credentials, sessionRef))) return forbidden(toolkit, "this visit does not continue that conversation");
  const archive = await deps.blobs.get(sessionRef);

  return archive ? toolkit.response(archive.bytes).type("application/gzip") : notFound(toolkit, `conversation "${sessionRef}" is gone`);
}

async function sessionSavedBy(deps: Deps, visitId: string): Promise<string | null> {
  const visit = isUuid(visitId) ? await deps.runs.visit(visitId) : null;

  return visit?.report?.sessionRef ?? null;
}

// A visit token restores only the conversation its own visit was opened to continue.
async function mayRestore(deps: Deps, credentials: Credentials, sessionRef: string): Promise<boolean> {
  if (credentials.kind !== "visit") return true;
  const visit = await deps.runs.visit(credentials.visitId);

  return visit?.resumedFrom === sessionRef;
}
