// The git credential broker (docs/api_sketch.md, "Station runs"): a pod's credential helper trades its visit token for a token for one repository the visit was given, minted when git asks.
import type { ResponseToolkit, Server } from "@hapi/hapi";
import { z } from "zod";
import { VISITS_TOO } from "../auth.js";
import type { Deps } from "../deps.js";
import { gitNeedFor, type GitNeed } from "../git-grant.js";
import { askProvider } from "../git-provider.js";
import { parseBody } from "../parse.js";
import { badGateway, badRequest, conflict, forbidden, notFound, unconfigured } from "../problem.js";
import { forOwnVisit, isUuid } from "./own-visit.js";

const asked = z.object({ repo: z.string().min(1) });

type Refused = ReturnType<ResponseToolkit["response"]>;

interface Asking {
  visitId: string;
  body: unknown;
}

export function registerGitCredentialRoutes(server: Server, deps: Deps): void {
  server.route({
    method: "POST",
    path: "/station-runs/{id}/git-credential",
    options: { auth: VISITS_TOO },
    handler: forOwnVisit((visitId, request, toolkit) => gitCredential(deps, { visitId, body: request.payload }, toolkit)),
  });
}

async function gitCredential(deps: Deps, asking: Asking, toolkit: ResponseToolkit) {
  const url = deps.config.gitCredentialUrl;

  if (!url) return unconfigured(toolkit, "this floor has no git credential provider configured, so it has no credential to give");
  const need = await neededBy(deps, asking, toolkit);

  if (!("kind" in need)) return need;
  const credential = await askProvider({ url, token: deps.config.serviceToken }, need);

  return credential ?? badGateway(toolkit, `the git credential provider gave no credential for "${need.repoUrl}"`);
}

async function neededBy(deps: Deps, asking: Asking, toolkit: ResponseToolkit): Promise<GitNeed | Refused> {
  const body = parseBody(asked, asking.body);

  if (!body.success) return badRequest(toolkit, "the request names no repository", body.errors);
  const found = isUuid(asking.visitId) ? await deps.briefs.briefFor(asking.visitId, deps.config.baseUrl) : null;

  if (!found) return notFound(toolkit, `no station run "${asking.visitId}"`);
  if (found.visit.report) return conflict(toolkit, `station run "${asking.visitId}" is already done`);

  return gitNeedFor(found.needs, body.value.repo) ?? forbidden(toolkit, `station run "${asking.visitId}" was given no repository "${body.value.repo}"`);
}
