// The pull loop: claim station_run.dispatch/abort events by tag, create or delete the CR triple, ack. See ../README.md for the abort-on-every-end judgement call.

import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import { buildAgentTriple } from "./domain/agent-triple.js";
import type { FloorClient } from "@re-cinq/floor-client";
import type { ClaimedEvent } from "@re-cinq/floor-contracts";
import { backoffDelay, runPollLoop, type PollLoopDeps } from "./lib/poll-loop.js";
import { modelSecretKeyFor, type KeyByFamily } from "./domain/model-secret.js";
import { describeClaimTick, dueForLivenessLog } from "./domain/liveness.js";

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
  /** Told of what the loop survives: a floor it could not reach. */
  onError?: (error: unknown) => void;
  /** Epoch ms; defaults to `Date.now`, injectable so the liveness log's once-a-minute rate limit is testable without the wall clock. */
  now?: () => number;
}

export type ClaimTickOutcome =
  | { kind: "empty" }
  | { kind: "dispatched"; visitId: string }
  | { kind: "aborted"; visitId: string }
  /** The visit had already reported, or was never there: nothing to run, and the dispatch is acked rather than tried again until it dies. */
  | { kind: "settled"; visitId: string; why: "reported" | "absent" }
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

export async function runClaimLoop(deps: ClaimLoopDeps): Promise<void> {
  const secretName = deps.secretName ?? DEFAULT_SECRET_NAME;
  const claimLimit = deps.claimLimit ?? DEFAULT_CLAIM_LIMIT;
  const now = deps.now ?? Date.now;
  let lastLoggedAt: number | null = null;

  await runPollLoop<ClaimTickOutcome[]>({
    tick: () => claimTick(deps, secretName, claimLimit),
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
    const outcome =
      event.name === "station_run.dispatch"
        ? await dispatch(deps, secretName, event.payload.visitId)
        : await abort(deps, secretName, event.payload.visitId);

    await floor.events.ack(event.id);

    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = floor.events.fail(event.id, message);

    await failed.catch(() => undefined);

    return { kind: "error", message };
  }
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
    visitId,
    floorBaseUrl: brief.floorBaseUrl,
    tokenSecretKey: tokenSecretKey(visitId),
    visitToken: brief.token,
    modelSecretKey: brief.modelSecretKey ?? modelSecretKeyFor(settings.model, deps.modelSecretKeys),
    secretName,
    deadlineMinutes: brief.deadlineMinutes,
    settings,
    needs: brief.needs,
    produces: brief.produces,
    conversation: brief.conversation,
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
