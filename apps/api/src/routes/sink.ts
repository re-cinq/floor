// What a running visit's executor calls (docs/api_sketch.md, "Station runs"): its structured brief, its event sink, its git credential. A visit token reaches only its own visit.
import type { ResponseToolkit, Server } from "@hapi/hapi";
import { Refusal, type AgentSettings, type DispatchBrief } from "@floor/store";
import type { Deps } from "../deps.js";
import { Sink } from "../engine/sink.js";
import { HTTP_NO_CONTENT } from "../http-status.js";
import { conflict, notFound, unconfigured } from "../problem.js";
import { forOwnVisit, isUuid } from "./own-visit.js";
import { mintVisitToken } from "../visit-token.js";

const MS_PER_MINUTE = 60_000;
const UNDATED_TOKEN_MINUTES = 60;

export function registerSinkRoutes(server: Server, deps: Deps): void {
  const sink = new Sink(deps);

  server.route({ method: "GET", path: "/station-runs/{id}/brief", handler: forOwnVisit((visitId, request, toolkit) => brief(deps, visitId, toolkit)) });
  server.route({ method: "POST", path: "/station-runs/{id}/sink", handler: forOwnVisit((visitId, request, toolkit) => takeEvent(sink, { visitId, body: request.payload }, toolkit)) });
  server.route({ method: "POST", path: "/station-runs/{id}/git-credential", handler: forOwnVisit((visitId, request, toolkit) => gitCredential(toolkit)) });
}

async function brief(deps: Deps, visitId: string, toolkit: ResponseToolkit) {
  const found = isUuid(visitId) ? await deps.briefs.briefFor(visitId, deps.config.baseUrl) : null;

  if (!found) return notFound(toolkit, `no station run "${visitId}" to dispatch`);
  if (found.visit.report) return conflict(toolkit, `station run "${visitId}" is already done`);

  return briefResponse(deps, found);
}

function briefResponse(deps: Deps, found: DispatchBrief) {
  const now = deps.now();
  const deadline = found.visit.deadline ?? new Date(now.getTime() + UNDATED_TOKEN_MINUTES * MS_PER_MINUTE);
  const conversation = found.conversation;

  return {
    visitId: found.visit.id,
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

// What the subsystem wants beyond model, prompt and image lives in the definition's `config`, under the names docs/entities/agent-definition.md gives them, which are lore's own.
function dispatchSettings(settings: AgentSettings) {
  const config = settings.config ?? {};

  return {
    model: settings.model,
    prompt: settings.prompt,
    image: settings.image,
    disallowedTools: textsOf(config.disallowed_tools),
    skills: textsOf(config.skills),
    env: textMapOf(config.env),
    permissionMode: config.permission_mode === "auto" || config.permission_mode === "bypass" ? config.permission_mode : undefined,
    maxTurns: typeof config.max_turns === "number" ? config.max_turns : undefined,
  };
}

function modelSecretKeyOf(settings: AgentSettings | null): string | undefined {
  const named = settings?.config?.model_secret_key;

  return typeof named === "string" ? named : undefined;
}

function textsOf(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;
}

function textMapOf(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const texts = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");

  return Object.fromEntries(texts);
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

function gitCredential(toolkit: ResponseToolkit) {
  return unconfigured(toolkit, "this floor has no git credential provider configured, so a git need cannot be granted write access");
}
