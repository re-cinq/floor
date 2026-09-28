// The pull loop: claim station_run.dispatch/abort events by tag, create or delete the CR triple, ack. See ../README.md for the abort-on-every-end judgement call.

import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import { buildAgentTriple, type DispatchNeed } from "./domain/agent-triple.js";
import type { GitNeedResolved } from "./domain/need.js";
import type { ClaimedEvent, DispatchBriefResponse, FloorClient } from "./floor-client.js";
import { backoffDelay, runPollLoop, type PollLoopDeps } from "./lib/poll-loop.js";
import { modelSecretKeyFor, type KeyByFamily } from "./domain/model-secret.js";

export interface ClaimLoopDeps {
  floor: FloorClient;
  resources: AgentResourcesApi;
  secrets: SecretKeyWriter;
  tags: string[];
  secretName?: string;
  /** The model secrets this cluster holds, by model family, where they differ from the usual API keys. */
  modelSecretKeys?: KeyByFamily;
  claimLimit?: number;
  /** How long to rest after finding nothing, and the most that rest may grow to while nothing keeps coming. */
  idleMs?: number;
  maxIdleMs?: number;
  sleep: (delayMs: number) => Promise<void>;
  running?: () => boolean;
}

export type ClaimTickOutcome =
  | { kind: "empty" }
  | { kind: "dispatched"; visitId: string }
  | { kind: "aborted"; visitId: string }
  | { kind: "error"; message: string };

const DEFAULT_IDLE_MS = 5_000;
const DEFAULT_MAX_IDLE_MS = 60_000;
const DEFAULT_CLAIM_LIMIT = 10;
const DEFAULT_SECRET_NAME = "agent-secrets";

export function tokenSecretKey(visitId: string): string {
  return `visit-${visitId}-token`;
}

/** The subsystem reads a `headers_secret` as a block of `Name: value` lines; a bare token has no colon, and is dropped without a word. */
export function authorizationHeader(token: string): string {
  return `Authorization: Bearer ${token}`;
}

export function gitCredentialSecretKey(visitId: string, needName: string): string {
  return `visit-${visitId}-git-${needName}`;
}

export async function runClaimLoop(deps: ClaimLoopDeps): Promise<void> {
  const secretName = deps.secretName ?? DEFAULT_SECRET_NAME;
  const claimLimit = deps.claimLimit ?? DEFAULT_CLAIM_LIMIT;

  await runPollLoop<ClaimTickOutcome[]>({
    tick: () => claimTick(deps, secretName, claimLimit),
    delayFor: (outcomes, idleTicks) =>
      outcomes.length === 0 ? backoffDelay(deps.idleMs ?? DEFAULT_IDLE_MS, idleTicks, deps.maxIdleMs ?? DEFAULT_MAX_IDLE_MS) : 0,
    isIdle: (outcomes) => outcomes.length === 0,
    sleep: deps.sleep,
    running: deps.running,
  } satisfies PollLoopDeps<ClaimTickOutcome[]>);
}

async function claimTick(
  deps: ClaimLoopDeps,
  secretName: string,
  claimLimit: number,
): Promise<ClaimTickOutcome[]> {
  const events = await deps.floor.claim(deps.tags, claimLimit);

  return Promise.all(events.map((event) => handle(deps, secretName, event)));
}

async function handle(
  deps: ClaimLoopDeps,
  secretName: string,
  event: ClaimedEvent,
): Promise<ClaimTickOutcome> {
  const floor = deps.floor;

  try {
    const outcome =
      event.name === "station_run.dispatch"
        ? await dispatch(deps, secretName, event.payload.visitId)
        : await abort(deps, secretName, event.payload.visitId);

    await floor.ack(event.id);

    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = floor.fail(event.id, message);

    await failed.catch(() => undefined);

    return { kind: "error", message };
  }
}

async function dispatch(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
): Promise<ClaimTickOutcome> {
  const brief = await deps.floor.brief(visitId);

  await deps.secrets.setKey(secretName, tokenSecretKey(visitId), authorizationHeader(brief.token));
  const needs = await resolveNeeds(deps, secretName, visitId, brief);

  const triple = buildAgentTriple({
    visitId,
    floorBaseUrl: brief.floorBaseUrl,
    tokenSecretKey: tokenSecretKey(visitId),
    modelSecretKey: brief.modelSecretKey ?? modelSecretKeyFor(brief.settings.model, deps.modelSecretKeys),
    secretName,
    deadlineMinutes: brief.deadlineMinutes,
    settings: brief.settings,
    needs,
    produces: brief.produces,
    conversation: brief.conversation,
  });

  await deps.resources.apply(triple);

  return { kind: "dispatched", visitId };
}

// A git need declaring write access is exchanged for a push credential and written into its own secret key; every other need is carried through as given.
async function resolveNeeds(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
  brief: DispatchBriefResponse,
): Promise<DispatchNeed[]> {
  return Promise.all(brief.needs.map((need) => resolveNeed(deps, secretName, visitId, need)));
}

async function resolveNeed(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
  need: DispatchBriefResponse["needs"][number],
): Promise<DispatchNeed> {
  if (need.kind !== "git") return need;
  if (need.access !== "write") return gitNeedWithToken(need);

  const token = await deps.floor.gitCredential(visitId);
  const key = gitCredentialSecretKey(visitId, need.name);

  await deps.secrets.setKey(secretName, key, token);

  return gitNeedWithToken(need, key);
}

function gitNeedWithToken(
  need: { name: string; path: string; repoUrl: string; ref: string },
  tokenSecret?: string,
): GitNeedResolved {
  return { name: need.name, kind: "git", path: need.path, repoUrl: need.repoUrl, ref: need.ref, tokenSecret };
}

async function abort(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
): Promise<ClaimTickOutcome> {
  const secrets = deps.secrets;

  await deps.resources.delete(`floor-${visitId}`);
  await secrets.deleteKey(secretName, tokenSecretKey(visitId)).catch(() => undefined);

  const gitNeedNames = await gitNeedNamesOf(deps, visitId);

  await Promise.all(
    gitNeedNames.map((name) => secrets.deleteKey(secretName, gitCredentialSecretKey(visitId, name)).catch(() => undefined)),
  );

  return { kind: "aborted", visitId };
}

// Best effort: the visit may be long gone by the time its abort is claimed, in which case there is nothing left to name here.
async function gitNeedNamesOf(deps: ClaimLoopDeps, visitId: string): Promise<string[]> {
  try {
    const brief = await deps.floor.brief(visitId);
    const gitNeeds = brief.needs.filter((need) => need.kind === "git");

    return gitNeeds.map((need) => need.name);
  } catch {
    return [];
  }
}
