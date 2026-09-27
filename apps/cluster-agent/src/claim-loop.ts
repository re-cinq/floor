// The pull loop: claim `station_run.dispatch`/`station_run.abort` events by
// tag, create or delete the AgentDefinition + Station + Agent triple, ack.
// Shape (idle backoff, never-throws-in-the-tick, poll forever) ported from
// lore's `@re-cinq/lore-cluster-agent` (events/claim/claim-loop.ts);
// the dispatch/abort handling itself is new, since lore dispatches an Agent
// CR straight from its own database row rather than an HTTP-claimed event.
//
// `station_run.abort` is read broadly here: not only a cancelled visit, but
// every visit's end, successful or not. Nothing in the walk currently tells
// this agent when a visit REPORTS successfully (the pod's own supervisor
// posts straight to the Floor's sink, never through this agent — see
// domain/agent-triple.ts's file header), so without this reading, a
// successful visit's CR triple and secret key would never be reclaimed.
// This is a one-line extension of an existing event's meaning, not a new
// concept, but it is a judgement call beyond what
// docs/assembly_run_storage.md states (`station_run.abort` there is
// triggered by `cancel` alone) — flagged here for confirmation.

import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import { buildAgentTriple, type DispatchNeed } from "./domain/agent-triple.js";
import type { ClaimedEvent, DispatchBriefResponse, FloorClient } from "./floor-client.js";
import { backoffDelay, runPollLoop, type PollLoopDeps } from "./lib/poll-loop.js";

export interface ClaimLoopDeps {
  floor: FloorClient;
  resources: AgentResourcesApi;
  secrets: SecretKeyWriter;
  tags: string[];
  secretName?: string;
  claimLimit?: number;
  sleep: (ms: number) => Promise<void>;
  running?: () => boolean;
}

export type ClaimTickOutcome =
  | { kind: "empty" }
  | { kind: "dispatched"; visitId: string }
  | { kind: "aborted"; visitId: string }
  | { kind: "error"; message: string };

const BASE_INTERVAL_MS = 5_000;
const MAX_IDLE_DELAY_MS = 60_000;
const DEFAULT_CLAIM_LIMIT = 10;
const DEFAULT_SECRET_NAME = "agent-secrets";

export function tokenSecretKey(visitId: string): string {
  return `visit-${visitId}-token`;
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
      outcomes.length === 0
        ? backoffDelay(BASE_INTERVAL_MS, idleTicks, MAX_IDLE_DELAY_MS)
        : 0,
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
  try {
    const outcome =
      event.name === "station_run.dispatch"
        ? await dispatch(deps, secretName, event.payload.visitId)
        : await abort(deps, secretName, event.payload.visitId);

    await deps.floor.ack(event.id);

    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await deps.floor.fail(event.id, message).catch(() => undefined);

    return { kind: "error", message };
  }
}

async function dispatch(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
): Promise<ClaimTickOutcome> {
  const brief = await deps.floor.brief(visitId);

  await deps.secrets.setKey(secretName, tokenSecretKey(visitId), brief.token);
  const needs = await resolveNeeds(deps, secretName, visitId, brief);

  const triple = buildAgentTriple({
    visitId,
    floorBaseUrl: brief.floorBaseUrl,
    tokenSecretKey: tokenSecretKey(visitId),
    modelSecretKey: brief.modelSecretKey,
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

// A git need declaring write access is exchanged for a push credential and
// written into its own secret key; every other need is carried through as
// given. See floor-client.ts's `gitCredential` for why read-only git needs
// get no credential here.
async function resolveNeeds(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
  brief: DispatchBriefResponse,
): Promise<DispatchNeed[]> {
  return Promise.all(
    brief.needs.map(async (need): Promise<DispatchNeed> => {
      if (need.kind !== "git" || need.access !== "write") {
        return need.kind === "git"
          ? { name: need.name, kind: "git", path: need.path, repoUrl: need.repoUrl, ref: need.ref }
          : need;
      }
      const token = await deps.floor.gitCredential(visitId);
      const key = gitCredentialSecretKey(visitId, need.name);

      await deps.secrets.setKey(secretName, key, token);

      return {
        name: need.name,
        kind: "git",
        path: need.path,
        repoUrl: need.repoUrl,
        ref: need.ref,
        tokenSecret: key,
      };
    }),
  );
}

async function abort(
  deps: ClaimLoopDeps,
  secretName: string,
  visitId: string,
): Promise<ClaimTickOutcome> {
  await deps.resources.delete(`floor-${visitId}`);
  await deps.secrets.deleteKey(secretName, tokenSecretKey(visitId)).catch(() => undefined);

  const needNames = await deps.floor
    .brief(visitId)
    .then((brief) => brief.needs.filter((n) => n.kind === "git").map((n) => n.name))
    .catch(() => [] as string[]);

  await Promise.all(
    needNames.map((name) =>
      deps.secrets.deleteKey(secretName, gitCredentialSecretKey(visitId, name)).catch(() => undefined),
    ),
  );

  return { kind: "aborted", visitId };
}
