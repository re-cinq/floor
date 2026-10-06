# @floor/cluster-agent

The only process in one deployment that talks to that cluster's Kubernetes
API. Claims `station_run.dispatch` and `station_run.abort` events from the
Floor by tag, and turns a dispatch into one AgentDefinition + Station +
Agent triple of the
[ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem), or an
abort into deleting that triple. See
[docs/entities/station.md](../../docs/entities/station.md), "AgentStation,
kind agent", and
[docs/assembly_run_storage.md](../../docs/assembly_run_storage.md), "the
agent kind runs on the ai-agent-subsystem, with no code of ours in the pod".

## Where this fits

One per cluster, and the only process allowed to talk to that cluster's Kubernetes API. It links
none of floor's packages: it claims `station_run.dispatch` and `station_run.abort` from the queue
over HTTP, by tag, so a floor can drive several clusters by tagging agent definitions differently
and never itself knows what a pod is.

It creates and deletes the subsystem's resources and never watches them. What the pod does comes
back to the api's own sink, not through here.

See [the map](../../README.md) for where the pod's work rejoins the walk.

## Ported from lore

Source: `apps/cluster-agent/src/{lib/k8s-errors,lib/poll-loop→libs/shared,
outbound/kube-clients,outbound/kube-agent-api,outbound/kube-token-provisioner}.ts`
in the lore monorepo, Apache 2.0, same organisation:

- `lib/k8s-errors.ts` — verbatim, generic apiserver error classification
- `lib/poll-loop.ts` — verbatim, the tick/backoff/sleep skeleton
- `kube/clients.ts` — trimmed `kube-clients.ts`; `loadKube`'s env-driven
  choice between in-cluster, a named kubeconfig, and the default kubeconfig
  is kept, since a dev machine on minikube (docs/dev_loop.md) and a real
  cluster need exactly that choice
- `kube/agent-resources.ts` — the create/delete pattern of
  `kube-agent-api.ts` (`KubeAgentApi`), generalised from one CR to the triple
- `kube/secret-writer.ts` — the read-modify-replace-with-retry pattern of
  `kube-token-provisioner.ts` (`KubeSecretKeyWriter`); the token-*minting*
  half of that file (the GitHub App JWT exchange) is not here: a git
  credential is never this agent's to hold
- `events/claim/claim-loop.ts` — the shape only (idle backoff, never throw
  inside a tick, poll forever); the dispatch/abort handling is new, since
  lore dispatches straight from its own database row, not an HTTP-claimed
  event

## What is new, and the two judgement calls in it

`domain/agent-triple.ts` maps a visit's resolved needs onto the three
subsystem custom resources; every field traces to a sentence in
`docs/entities/station.md`'s mapping table or the subsystem's own CRD
reference (`ai-agent-subsystem/website/.../reference/crd-*.md`), with two
exceptions called out in its file header:

1. **A triple is minted per visit**, not synced once per repo/task-type the
   way lore's catalog does. A `git` need's branch+sha and a `continue`
   conversation's session id are per-visit, so a shared, long-lived
   AgentDefinition would always be one visit stale on at least one of them.
2. **The conversation contract is the subsystem's own**, read from its
   source: it restores with `GET {source}/{id}` and saves with
   `POST {source}/{pin}`, and hands `pin` to the agent as its session id,
   which must be a uuid. So `source` is the floor's `/conversations`, `pin`
   is the visit id, and `id` is the id of the earlier visit being continued.
   A station that continues saves its first round too, or its second would
   have nothing to restore.
3. **A `headers_secret` holds a header, not a token.** The subsystem reads
   the secret as `Name: value` lines and silently drops a line with no
   colon, so the visit token is written as `Authorization: Bearer <token>`.
   The same secret authorises the sink, file downloads, file uploads and the
   conversation archive.
4. **The model's secret is this agent's to name** when the brief names none:
   `ANTHROPIC_API_KEY` for a `claude` model, and so on
   (`domain/model-secret.ts`). `FLOOR_MODEL_SECRET_KEYS` says what this
   cluster holds where that differs: `claude=CLAUDE_CODE_OAUTH_TOKEN` for a
   laptop running on a Claude subscription. The name must be a key that
   exists in `agent-secrets`: the pod's reference to it is not optional, so
   a wrong name is a pod that never starts.

5. **A prompt is told where things are.** Besides each value need under its
   own name, a prompt gets `{<name>_path}` for every file need, git need and
   file the station produces: its full path under `/workspace`
   (`domain/prompt-parameters.ts`). With no repo cloned the agent's working
   directory is `/`, so a prompt that says `note.md` has the agent write
   somewhere the subsystem never looks. A prompt is also told which run it
   works for: `{run_id}`, `{line_id}` and `{node_id}`, the visit's assembly
   run, that run's assembly line, and the node of it this visit is a pass at. A value need of the same name wins, so a line that
   hands its station a `run_id` of its own (the run that settled, say) is
   read as it was written.

The loop rests 5 seconds after finding nothing, growing to a minute while
nothing keeps coming; `FLOOR_CLAIM_IDLE_MS` and `FLOOR_CLAIM_MAX_IDLE_MS`
change both. On a laptop a lower ceiling makes clean-up after a visit prompt.

Otherwise this agent logs only on error, on stop, and on a fatal crash, which after hours of quiet
traffic reads the same as wedged. So every tick, `[cluster-agent] alive, ...` says what that tick
last claimed (or that it found nothing) — rate-limited to once a minute (`domain/liveness.ts`) so
the idle backoff above, much faster than a minute, never floods the log.

On SIGTERM or SIGINT the agent stops claiming: an idle sleep is cut short, and a dispatch already
in flight is finished and acked before the loop returns, the health server closes and the process
exits with code 0. The chart gives the pod 60 seconds for that, and every request to the Floor
gives up after 30.

`claim-loop.ts` also widens `station_run.abort` beyond what
`docs/assembly_run_storage.md` states (there, only `cancel` triggers it): it
treats abort as "release this visit's cluster resources," fired on every
visit's end, because nothing else tells this agent when a visit reports
successfully — the pod's own supervisor posts straight to the Floor's sink,
never through this agent. Without that widening the CR triple and the
per-visit secret keys would never be reclaimed on the common path. Flagged
for confirmation in the same file.

A `git` need gets no credential from this agent, read or write. The Agent
it creates carries the visit's token and the Floor's address as the
subsystem's `git_credential` and `git_credential_url` parameters
(`domain/agent-triple.ts`), and git in the pod asks the Floor when it
authenticates. The one secret key this agent writes for a visit is the
visit's own token.

A pod is told what is true of every pod of its kind
(`domain/pod-environment.ts`), so no agent definition has to say it. A visit
with write access to a repository commits as `Floor Agent`: git's own
`GIT_AUTHOR_*` and `GIT_COMMITTER_*` variables. A Gemini pod trusts its
workspace, `GEMINI_CLI_TRUST_WORKSPACE`, without which Gemini's CLI stops
with nobody to ask. What the agent definition's `env` sets wins.

## Not ported

Everything that watches Agent CRs for terminal status
(`events/listeners/k8s-watch.ts`, `agent-reporting.ts`) has no counterpart:
the plan's pods report through their own sink, so this agent never watches
what it creates. Also not ported: the catalog sync loop (lore's own
AgentDefinition/Station CRDs are synced from Postgres; this plan builds them
fresh per visit instead), registration/heartbeat against a cluster-agent
registry (no such registry is in the plan's API), and pod-log tailing (logs
reach the Floor through the same sink).

## Tests

The tests cover the pure CR-mapping table (`domain/agent-triple.test.ts`), the two
Kubernetes IO seams against a fake client
(`kube/agent-resources.test.ts`, `kube/secret-writer.test.ts`), the
claim loop's dispatch/abort/backoff behaviour against a fake Floor client
(`claim-loop.test.ts`, which also covers the liveness log's once-a-minute
rate limit), and that rate limit's own pure rule
(`domain/liveness.test.ts`).
