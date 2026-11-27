// What a running visit's executor calls (docs/api_sketch.md, "Station runs"): its structured brief and its event sink. A visit token reaches only its own visit.
import type { ResponseToolkit, Server } from "@hapi/hapi";
import { Refusal, enforce, type DispatchBrief } from "@floor/store";
import type { BriefSettings, VisitBrief } from "@re-cinq/floor-contracts";
import { dispatchSettings, modelSecretKeyOf } from "../agent-config.js";
import { VISITS_TOO } from "../auth.js";
import { SIGNING_KEY_ENV } from "../gateway-keys.js";
import { mintGatewayToken } from "../gateway-token.js";
import { declaresWrite } from "../git-grant.js";
import type { Deps } from "../deps.js";
import { Sink } from "../engine/sink.js";
import { HTTP_NO_CONTENT } from "../http-status.js";
import { conflict, notFound } from "../problem.js";
import { forOwnVisit, isUuid } from "./own-visit.js";
import { mintVisitToken } from "../visit-token.js";

const MS_PER_MINUTE = 60_000;
const UNDATED_TOKEN_MINUTES = 60;

export function registerSinkRoutes(server: Server, deps: Deps): void {
  const sink = new Sink(deps);

  server.route({ method: "GET", path: "/station-runs/{id}/brief", options: { auth: VISITS_TOO }, handler: forOwnVisit((visitId, request, toolkit) => brief(deps, visitId, toolkit)) });
  server.route({ method: "POST", path: "/station-runs/{id}/sink", options: { auth: VISITS_TOO }, handler: forOwnVisit((visitId, request, toolkit) => takeEvent(sink, { visitId, body: request.payload }, toolkit)) });
}

async function brief(deps: Deps, visitId: string, toolkit: ResponseToolkit) {
  const found = isUuid(visitId) ? await deps.briefs.briefFor(visitId, deps.config.baseUrl) : null;

  if (!found) return notFound(toolkit, `no station run "${visitId}" to dispatch`);
  if (found.visit.report) return conflict(toolkit, `station run "${visitId}" is already done`);

  try {
    return briefResponse(deps, found);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;

    return conflict(toolkit, error.message);
  }
}

function briefResponse(deps: Deps, found: DispatchBrief): VisitBrief {
  enforce(deps.config.gitCredentialUrl || !declaresWrite(found.needs), "this floor has no git credential provider configured, so a git need cannot be granted write access");
  const now = deps.now();
  const deadline = found.visit.deadline ?? new Date(now.getTime() + UNDATED_TOKEN_MINUTES * MS_PER_MINUTE);
  const conversation = found.conversation;
  const settings = found.settings ? dispatchSettings(found.settings) : null;

  return {
    visitId: found.visit.id,
    runId: found.visit.runId,
    lineId: found.lineId,
    nodeId: found.visit.nodeId,
    iteration: found.visit.iteration,
    floorBaseUrl: deps.config.baseUrl,
    token: mintVisitToken(found.visit.id, deadline, deps.config.visitTokenSecret),
    deadlineMinutes: Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / MS_PER_MINUTE)),
    settings,
    needs: found.needs,
    produces: found.produces,
    conversation: conversation.mode === "continue" ? { mode: "continue", sessionRef: conversation.visitId } : conversation,
    modelSecretKey: modelSecretKeyOf(found.settings),
    serverTokens: serverTokens(deps, found, { settings, deadline, now }),
  };
}

// One gateway token for each MCP server that asks for one, by the server's name; undefined when none does, so the brief of every other visit is what it was.
function serverTokens(deps: Deps, found: DispatchBrief, visit: { settings: BriefSettings | null; deadline: Date; now: Date }): Record<string, string> | undefined {
  const asking = (visit.settings?.mcpServers ?? []).flatMap((server) => (server.visitToken ? [{ name: server.name, ...server.visitToken }] : []));

  if (asking.length === 0) return undefined;
  const { baseUrl, gatewayKeys } = deps.config;

  enforce(gatewayKeys.signing, `MCP server "${asking[0]!.name}" asks for a gateway token, and this floor has no key to sign one with: set ${SIGNING_KEY_ENV}`);
  const ask = { issuer: baseUrl, visitId: found.visit.id, runId: found.visit.runId, repo: found.repo, deadline: visit.deadline, now: visit.now };

  return Object.fromEntries(asking.map(({ name, audience, scopes }) => [name, mintGatewayToken({ ...ask, audience, scopes }, gatewayKeys.signing!)]));
}

async function takeEvent(sink: Sink, posted: { visitId: string; body: unknown }, toolkit: ResponseToolkit) {
  if (!isUuid(posted.visitId)) return notFound(toolkit, `no station run "${posted.visitId}"`);

  try {
    await sink.take(posted.visitId, posted.body);

    return toolkit.response().code(HTTP_NO_CONTENT);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;

    return conflict(toolkit, error.message);
  }
}
