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
  half of that file (the GitHub App JWT exchange) is not here, because the
  plan makes that an HTTP concern of a `git-credential` service station on
  the Floor, not a Kubernetes concern of this agent
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
2. **The `conversation` field's exact wire contract is a best-effort read**
   of the subsystem's reference, not a verified one — see the comment on
   `conversationRef` before relying on `conversation: continue` against a
   real cluster.

`claim-loop.ts` also widens `station_run.abort` beyond what
`docs/assembly_run_storage.md` states (there, only `cancel` triggers it): it
treats abort as "release this visit's cluster resources," fired on every
visit's end, because nothing else tells this agent when a visit reports
successfully — the pod's own supervisor posts straight to the Floor's sink,
never through this agent. Without that widening the CR triple and the
per-visit secret keys would never be reclaimed on the common path. Flagged
for confirmation in the same file.

A read-only `git` need gets no credential (`floor-client.ts`'s
`gitCredential` doc comment): the documented endpoint is scoped to `access:
write` needs and refuses anything else, so a private repo cloned read-only
is a real gap here, not an oversight to silently paper over.

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

37 cases: the pure CR-mapping table (`domain/agent-triple.test.ts`), the two
Kubernetes IO seams against a fake client
(`kube/agent-resources.test.ts`, `kube/secret-writer.test.ts`), and the
claim loop's dispatch/abort/backoff behaviour against a fake Floor client
(`claim-loop.test.ts`).
