// What a running visit's executor calls (docs/api_sketch.md, "Station runs"): its structured brief and its event sink. A visit token reaches only its own visit.
import type { ResponseToolkit, Server } from "@hapi/hapi";
import { Refusal, enforce, type AgentSettings, type DispatchBrief } from "@floor/store";
import { agentConfigSchema, executorSettings } from "../agent-config.js";
import { declaresWrite } from "../git-grant.js";
import type { Deps } from "../deps.js";
import { Sink } from "../engine/sink.js";
import { HTTP_NO_CONTENT } from "../http-status.js";
import { issuesOf } from "../parse.js";
import { conflict, notFound } from "../problem.js";
import { forOwnVisit, isUuid } from "./own-visit.js";
import { mintVisitToken } from "../visit-token.js";

const MS_PER_MINUTE = 60_000;
const UNDATED_TOKEN_MINUTES = 60;

export function registerSinkRoutes(server: Server, deps: Deps): void {
  const sink = new Sink(deps);

  server.route({ method: "GET", path: "/station-runs/{id}/brief", handler: forOwnVisit((visitId, request, toolkit) => brief(deps, visitId, toolkit)) });
  server.route({ method: "POST", path: "/station-runs/{id}/sink", handler: forOwnVisit((visitId, request, toolkit) => takeEvent(sink, { visitId, body: request.payload }, toolkit)) });
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

function briefResponse(deps: Deps, found: DispatchBrief) {
  enforce(deps.config.gitCredentialUrl || !declaresWrite(found.needs), "this floor has no git credential provider configured, so a git need cannot be granted write access");
  const now = deps.now();
  const deadline = found.visit.deadline ?? new Date(now.getTime() + UNDATED_TOKEN_MINUTES * MS_PER_MINUTE);
  const conversation = found.conversation;

  return {
    visitId: found.visit.id,
    iteration: found.visit.iteration,
    floorBaseUrl: deps.config.baseUrl,
    token: mintVisitToken(found.visit.id, deadline, deps.config.visitTokenSecret),
    deadlineMinutes: Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / MS_PER_MINUTE)),
    settings: found.settings ? dispatchSettings(found.settings) : null,
    needs: found.needs,
    produces: found.produces,
    conversation: conversation.mode === "continue" ? { mode: "continue", sessionRef: conversation.visitId } : conversation,
    modelSecretKey: modelSecretKeyOf(found.settings),
  };
}

// A definition's config was checked when it was put; one that no longer reads is refused here, by name, and never half-applied.
function dispatchSettings(settings: AgentSettings) {
  const config = agentConfigSchema.safeParse(settings.config ?? {});

  if (!config.success) throw new Refusal(`the agent definition's config cannot be read: ${issuesOf(config.error).join("; ")}`);

  return { model: settings.model, prompt: settings.prompt, image: settings.image, ...executorSettings(config.data) };
}

function modelSecretKeyOf(settings: AgentSettings | null): string | undefined {
  const named = settings?.config?.model_secret_key;

  return typeof named === "string" ? named : undefined;
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
