// The pull loop: claim station_run.dispatch/abort events by tag, create a visit's Agent (and its recipe when new) or delete it, ack; claim this cluster's agent_definition.changed events and push the latest version's recipes; between ticks, register with the floor and sweep the recipes no Agent runs. See ../README.md for the abort-on-every-end judgement call.

import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import { buildAgentTriple } from "./domain/agent-triple.js";
import type { FloorClient } from "@re-cinq/floor-client";
import type { ClaimedEvent } from "@re-cinq/floor-contracts";
import { backoffDelay, runPollLoop, type PollLoopDeps } from "./lib/poll-loop.js";
import { modelSecretKeyFor, type KeyByFamily } from "./domain/model-secret.js";
import { describeClaimTick, dueForLivenessLog } from "./domain/liveness.js";
import { heldBody, pushedRecipes } from "./domain/pushed-recipe.js";

export interface ClaimLoopDeps {
  floor: FloorClient;
  /** The id this cluster registers under; its own copy of a changed agent definition is tagged with it. */
  clusterId: string;
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
  /** Told of what the loop survives: a floor it could not reach, a sweep that failed. */
  onError?: (error: unknown) => void;
  /** Epoch ms; defaults to `Date.now`, injectable so the liveness log's once-a-minute rate limit is testable without the wall clock. */
  now?: () => number;
}

export type ClaimTickOutcome =
  | { kind: "empty" }
  | { kind: "dispatched"; visitId: string }
  | { kind: "aborted"; visitId: string }
  /** The agent definition's latest version is what kube holds now, and the floor was told; `latest` null when the floor no longer has it. */
  | { kind: "pushed"; definitionId: string; latest: string | null }
  /** The visit had already reported, or was never there: nothing to run, and the dispatch is acked rather than tried again until it dies. */
  | { kind: "settled"; visitId: string; why: "reported" | "absent" }
  | { kind: "error"; message: string };

const DEFAULT_IDLE_MS = 5_000;
const DEFAULT_MAX_IDLE_MS = 60_000;
const DEFAULT_CLAIM_LIMIT = 10;
const DEFAULT_SECRET_NAME = "agent-secrets";
const SWEEP_EVERY_MS = 600_000;
/** Well inside the floor's CLUSTER_LIVE_MINUTES, so a cluster that is up never reads as gone. */
const REGISTER_EVERY_MS = 60_000;

export const AGENT_DEFINITION_REPORTED = "agent_definition.reported";

export function tokenSecretKey(visitId: string): string {
  return `visit-${visitId}-token`;
}

/** The subsystem reads a `headers_secret` as a block of `Name: value` lines; a bare token has no colon, and is dropped without a word. */
export function authorizationHeader(token: string): string {
  return `Authorization: Bearer ${token}`;
}

export async function runClaimLoop(deps: ClaimLoopDeps): Promise<void> {
  const secretName = deps.secretName ?? DEFAULT_SECRET_NAME;
  const claimLimit = deps.claimLimit ?? DEFAULT_CLAIM_LIMIT;
  const now = deps.now ?? Date.now;
  let lastLoggedAt: number | null = null;
  let lastSweptAt: number | null = null;
  let lastRegisteredAt: number | null = null;

  await runPollLoop<ClaimTickOutcome[]>({
    // The sweep runs after the tick's dispatches, never beside one, so it cannot remove a recipe a dispatch is about to use.
    tick: async () => {
      lastRegisteredAt = await registerIfDue(deps, lastRegisteredAt, now());
      const outcomes = await claimTick(deps, secretName, claimLimit);

      lastSweptAt = await sweepIfDue(deps, lastSweptAt, now());

      return outcomes;
    },
    onOutcome: (outcomes) => {
      lastLoggedAt = logLivenessIfDue(outcomes, lastLoggedAt, now());
    },
    delayFor: (outcomes, idleTicks) =>
      outcomes.length === 0 ? backoffDelay(deps.idleMs ?? DEFAULT_IDLE_MS, idleTicks, deps.maxIdleMs ?? DEFAULT_MAX_IDLE_MS) : 0,
    isIdle: (outcomes) => outcomes.length === 0,
    sleep: deps.sleep,
    running: deps.running,
  } satisfies PollLoopDeps<ClaimTickOutcome[]>);
}

// A floor out of reach is told again on the next tick: registering is how the floor knows this cluster still holds what it reported.
async function registerIfDue(deps: ClaimLoopDeps, lastRegisteredAt: number | null, now: number): Promise<number | null> {
  if (lastRegisteredAt !== null && now - lastRegisteredAt < REGISTER_EVERY_MS) return lastRegisteredAt;

  try {
    const { clusters } = deps.floor;

    await clusters.register(deps.clusterId, deps.tags);

    return now;
  } catch (error) {
    deps.onError?.(error);

    return lastRegisteredAt;
  }
}

async function sweepIfDue(deps: ClaimLoopDeps, lastSweptAt: number | null, now: number): Promise<number | null> {
  if (lastSweptAt !== null && now - lastSweptAt < SWEEP_EVERY_MS) return lastSweptAt;

  const { resources } = deps;

  await resources.sweep(new Date(now)).catch((error: unknown) => deps.onError?.(error));

  return now;
}

// At most once a minute (dueForLivenessLog), or 11+ hours of silence reads the same as wedged whether or not it is.
function logLivenessIfDue(outcomes: ClaimTickOutcome[], lastLoggedAt: number | null, now: number): number | null {
  if (!dueForLivenessLog(lastLoggedAt, now)) return lastLoggedAt;

  console.log(`[cluster-agent] alive, ${describeClaimTick(outcomes)}`);

  return now;
}

async function claimTick(
  deps: ClaimLoopDeps,
  secretName: string,
  claimLimit: number,
): Promise<ClaimTickOutcome[]> {
  const events = await claimed(deps, claimLimit);

  return Promise.all(events.map((event) => handle(deps, secretName, event)));
}

// A floor out of reach is a tick that found nothing, not the end of the agent: it starts before the floor on a fresh install, and outlives every restart of it.
async function claimed(deps: ClaimLoopDeps, claimLimit: number): Promise<ClaimedEvent[]> {
  try {
    const { events } = deps.floor;

    return await events.claim({ tags: deps.tags, limit: claimLimit });
  } catch (error) {
    deps.onError?.(error);

    return [];
  }
}

async function handle(
  deps: ClaimLoopDeps,
  secretName: string,
  event: ClaimedEvent,
): Promise<ClaimTickOutcome> {
  const floor = deps.floor;

  try {
    const outcome = await outcomeOf(deps, secretName, event);

    await floor.events.ack(event.id);

    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = floor.events.fail(event.id, message);

    await failed.catch(() => undefined);

    return { kind: "error", message };
  }
}

function outcomeOf(deps: ClaimLoopDeps, secretName: string, event: ClaimedEvent): Promise<ClaimTickOutcome> {
  if (event.name === "agent_definition.changed") return push(deps, event.payload.id);
  if (event.name === "station_run.dispatch") return dispatch(deps, secretName, event.payload.visitId);

  return abort(deps, secretName, event.payload.visitId);
}

// The latest version, read now, whatever the event named: a late or repeated event can never set a cluster back. Acked only once kube reads back that version.
async function push(deps: ClaimLoopDeps, definitionId: string): Promise<ClaimTickOutcome> {
  const { agentDefinitions } = deps.floor;
  const recipes = await agentDefinitions.recipes(definitionId);

  if (!recipes) return { kind: "pushed", definitionId, latest: null };

  for (const recipe of pushedRecipes(recipes, deps.modelSecretKeys)) {
    await deps.resources.applyRecipe(recipe);
  }

  const held = await deps.resources.heldRecipes(definitionId);

  if (!held.some((recipe) => recipe.hash === recipes.hash)) throw new Error(`kube does not hold agent definition ${definitionId} at ${recipes.hash}`);
  await reportHolding(deps, definitionId, held);

  return { kind: "pushed", definitionId, latest: recipes.hash };
}

/** Tells the floor what kube holds of one agent definition, a hand edit included; the floor adopts an edit as the newest version. */
export async function reportHolding(deps: Pick<ClaimLoopDeps, "floor" | "clusterId" | "resources">, definitionId: string, held?: Awaited<ReturnType<ClaimLoopDeps["resources"]["heldRecipes"]>>): Promise<void> {
  const body = heldBody(held ?? (await deps.resources.heldRecipes(definitionId)));

  if (!body) return;

  const { events } = deps.floor;

  await events.post({ name: AGENT_DEFINITION_REPORTED, payload: { clusterId: deps.clusterId, definitionId, body } });
}

async function dispatch(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
): Promise<ClaimTickOutcome> {
  const { stationRuns } = deps.floor;
  const outcome = await stationRuns.brief(visitId);

  if (outcome.kind !== "brief") return { kind: "settled", visitId, why: outcome.kind };
  const brief = outcome.brief;

  if (!brief.settings) throw new Error(`station run "${visitId}" dispatched an agent with no settings, so there is no image to run`);
  const settings = brief.settings;

  await deps.secrets.setKey(secretName, tokenSecretKey(visitId), authorizationHeader(brief.token));
  const triple = buildAgentTriple({
    ...brief,
    visitId,
    tokenSecretKey: tokenSecretKey(visitId),
    visitToken: brief.token,
    modelSecretKey: brief.modelSecretKey ?? modelSecretKeyFor(settings.model, deps.modelSecretKeys),
    secretName,
    settings,
  });

  await deps.resources.apply(triple);

  return { kind: "dispatched", visitId };
}

async function abort(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
): Promise<ClaimTickOutcome> {
  const secrets = deps.secrets;

  await deps.resources.delete(`floor-${visitId}`);
  await secrets.deleteKey(secretName, tokenSecretKey(visitId)).catch(() => undefined);

  return { kind: "aborted", visitId };
}
