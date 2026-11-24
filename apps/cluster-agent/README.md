# @floor/cluster-agent

The only process in one deployment that talks to that cluster's Kubernetes API. It claims `station_run.dispatch` and `station_run.abort` events from the Floor by tag. A dispatch becomes an Agent of the [ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem) running a recipe (an AgentDefinition + Station) shared by every visit with the same settings. An abort deletes that Agent. See [docs/assembly_run_storage.md](../../docs/assembly_run_storage.md), "The agent kind runs on the ai-agent-subsystem, with no code of ours in the pod".

## Where this fits

There is one per cluster. It links none of floor's packages. It claims from the queue over HTTP, so a floor can drive several clusters by tagging agent definitions differently and never itself knows what a pod is.

It creates and deletes the subsystem's resources and never watches them. What the pod does comes back to the api's own sink, not through here.

See [the map](../../README.md) for where the pod's work rejoins the walk.

## Ported from lore

Source: `apps/cluster-agent/src/{lib/k8s-errors,lib/poll-loop→libs/shared, outbound/kube-clients,outbound/kube-agent-api,outbound/kube-token-provisioner}.ts` in the lore monorepo, Apache 2.0, same organisation.

- `lib/k8s-errors.ts` is verbatim, generic apiserver error classification.
- `lib/poll-loop.ts` is verbatim, the tick/backoff/sleep skeleton.
- `kube/clients.ts` is a trimmed `kube-clients.ts`. `loadKube`'s env-driven choice between in-cluster, a named kubeconfig and the default kubeconfig is kept, since a dev machine on minikube (docs/dev_loop.md) and a real cluster need exactly that choice.
- `kube/agent-resources.ts` is the create/delete pattern of `kube-agent-api.ts` (`KubeAgentApi`), generalised from one CR to the triple.
- `kube/secret-writer.ts` is the read-modify-replace-with-retry pattern of `kube-token-provisioner.ts` (`KubeSecretKeyWriter`). The token-minting half of that file (the GitHub App JWT exchange) is not here, because a git credential is never this agent's to hold.
- `claim-loop.ts` takes the shape only (idle backoff, never throw inside a tick, poll forever). The dispatch/abort handling is new, since lore dispatches straight from its own database row, not an HTTP-claimed event.

## What is new, and the judgement calls in it

`domain/agent-triple.ts` maps a visit's resolved needs onto the three subsystem custom resources, a recipe and an Agent. Every field traces to a row of the mapping table in `docs/assembly_run_storage.md`, "The agent kind runs on the ai-agent-subsystem, with no code of ours in the pod", or the subsystem's own CRD reference (`ai-agent-subsystem/website/.../reference/crd-*.md`), with five exceptions.

1. **A recipe per settings, an Agent per visit.** The AgentDefinition and Station hold only what the visit's settings decide: model, prompt, tools, skills, MCP servers, the model's secret, the definition's own env, image, pod resources, and its `timeoutMinutes` as the Station's deadline. The deadline is not the minutes the visit has left, which differ for every visit. Both are named `floor-<12 hex>` after a hash of that content. The settings are the agent definition's latest version merged with the run's repository variant, so a new version or a changed variant is a new recipe, and every visit that runs the same settings shares one. A recipe is created only when absent (a 409 is the one already there). What belongs to the visit rides on its Agent, `floor-<visitId>`, which ai-agent-subsystem v0.15.0 lays over the recipe: the repos to clone, the conversation, the sink and file uploads under the visit's token, and the git identity of a visit that writes (a variable the definition sets itself wins). The Agent is created labelled `agents.re-cinq.com/station` and `agents.re-cinq.com/agent-definition` with its recipe's name. Before v0.15.0 a whole triple was minted per visit, because a shared AgentDefinition would have been one visit stale on the branch or the conversation.
2. **The conversation contract is the subsystem's own**, read from its source. It restores with `GET {source}/{id}` and saves with `POST {source}/{pin}`, and hands `pin` to the agent as its session id, which must be a uuid. So `source` is the floor's `/conversations`, `pin` is the visit id, and `id` is the id of the earlier visit being continued. A station that continues saves its first round too, or its second would have nothing to restore.
3. **A `headers_secret` holds a header, not a token.** The subsystem reads the secret as `Name: value` lines and silently drops a line with no colon, so the visit token is written as `Authorization: Bearer <token>`. The same secret authorises the sink, file downloads, file uploads and the conversation archive.
4. **The model's secret is this agent's to name** when the brief names none: `ANTHROPIC_API_KEY` for a `claude` model, and so on (`domain/model-secret.ts`). `FLOOR_MODEL_SECRET_KEYS` says what this cluster holds where that differs, such as `claude=CLAUDE_CODE_OAUTH_TOKEN` for a laptop running on a Claude subscription. The name must be a key that exists in `agent-secrets`. The pod's reference to it is not optional, so a wrong name is a pod that never starts.
5. **A prompt is told where things are.** Besides each value need under its own name, a prompt gets `{<name>_path}` for every file need, git need and file the station produces: its full path under `/workspace` (`promptParameters` in `@re-cinq/floor-assembly-lines`). With no repo cloned the agent's working directory is `/`, so a prompt that says `note.md` has the agent write somewhere the subsystem never looks. A prompt is also told which run it works for: `{run_id}`, `{line_id}` and `{node_id}`, the visit's assembly run, that run's assembly line, and the node of it this visit is a pass at. A value need of the same name wins, so an assembly line that hands its station a `run_id` of its own (the run that settled, say) is read as it was written.

### The idle backoff and the liveness log

The loop rests 5 seconds after finding nothing, growing to a minute while nothing keeps coming. `FLOOR_CLAIM_IDLE_MS` and `FLOOR_CLAIM_MAX_IDLE_MS` change both. On a laptop a lower ceiling makes clean-up after a visit prompt.

Otherwise this agent logs only on error, on stop, and on a fatal crash, which after hours of quiet traffic reads the same as wedged. So every tick, `[cluster-agent] alive, ...` says what that tick last claimed, or that it found nothing. The line is rate-limited to once a minute (`domain/liveness.ts`), so the idle backoff, much faster than a minute, never floods the log.

### Stopping

On SIGTERM or SIGINT the agent stops claiming. An idle sleep is cut short, and a dispatch already in flight is finished and acked before the loop returns. Then the health server closes and the process exits with code 0. The chart gives the pod 60 seconds for that, and every request to the Floor gives up after 30.

### Abort on every end

`claim-loop.ts` widens `station_run.abort` beyond what `docs/assembly_run_storage.md` states. There, only `cancel` triggers it. Here abort means "release this visit's cluster resources" and fires on every visit's end, because nothing else tells this agent when a visit reports successfully. The pod's own supervisor posts straight to the Floor's sink, never through this agent. Without the widening the visit's Agent and its secret key would never be reclaimed on the common path. It is flagged for confirmation in the same file. An abort deletes the Agent only, because its recipe may be running other visits.

### The sweep

At most every ten minutes, after a tick's dispatches and never beside one, the loop sweeps. It first deletes the finished (Succeeded or Failed) `floor-<visitId>` Agents older than a day, whose abort was lost. A visit reports long before that, and ten such Agents from 2026-10-02 on were still there on 10-30. It then removes the recipes no Agent runs any more (`domain/recipe-sweep.ts`): the floor's Stations no Agent's `stationRef` names, then the floor's AgentDefinitions no remaining Station names. A recipe younger than ten minutes is kept, its first Agent possibly not made yet.

The floor's own are those labelled `floor.re-cinq.com/recipe`, and the unlabelled `floor-<uuid>` triples of earlier releases, which the same sweep clears once their Agent is gone. Nothing else in the namespace is touched. A sweep that fails is logged and tried at the next one. The Role grants `list` on the three kinds for it.

### Git credentials

A `git` need gets no credential from this agent, read or write. The Agent it creates carries the visit's token and the Floor's address as the subsystem's `git_credential` and `git_credential_url` parameters (`domain/agent-triple.ts`), and git in the pod asks the Floor when it authenticates. The one secret key this agent writes for a visit is the visit's own token.

### The pod's environment

A pod is told what is true of every pod of its kind (`domain/pod-environment.ts`), so no agent definition has to say it. A visit with write access to a repository commits as `Floor Agent`, through git's own `GIT_AUTHOR_*` and `GIT_COMMITTER_*` variables. A Gemini pod trusts its workspace through `GEMINI_CLI_TRUST_WORKSPACE`, without which Gemini's CLI stops with nobody to ask. What the agent definition's `env` sets wins.

An agent definition's `pod_resources` reaches this agent in the brief's settings as `podResources` and becomes the `resources` of the pod's `agent` container. When unset, the container carries none and the subsystem's default applies. A definition with no `model` gets no model secret, since the family is read from the model's name.

## Not ported

Everything that watches Agent CRs for terminal status (`events/listeners/k8s-watch.ts`, `agent-reporting.ts`) has no counterpart. The plan's pods report through their own sink, so this agent never watches what it creates. Pod-log tailing is not ported either, because logs reach the Floor through the same sink.

## Pushed recipes

The agent registers with the floor under `FLOOR_CLUSTER_ID` every minute and offers `cluster:<id>` beside its tags. It registers its build (`FLOOR_BUILD_SHA`) and the agent subsystem's release and CLI pins, read from the `agent-subsystem-versions` ConfigMap in `FLOOR_SUBSYSTEM_NAMESPACE` (default: the agents namespace). `kube/subsystem-versions.ts` reads them, and gives null when it cannot, never a failed register.

Its own `agent_definition.changed` events push the latest version's recipes ahead of any visit (`domain/pushed-recipe.ts`), labelled `floor.re-cinq.com/definition` and annotated with the version, the variant and the floor body. A recipe a visit made first is marked in place (a merge patch). The agent watches those recipes (`kube/recipe-watch.ts`) and posts what kube holds as `agent_definition.reported`, so a hand edit becomes the floor's newest version. The sweep keeps the newest pushed recipe of each agent definition and variant, though no Agent runs it yet. The Role grants `watch` and `patch` for it. See docs/assembly_run_storage.md, "Distribution and presence".

## Tests

The tests cover four things:

- the pure CR-mapping table (`domain/agent-triple.test.ts`)
- the two Kubernetes IO seams against a fake client (`kube/agent-resources.test.ts`, `kube/secret-writer.test.ts`)
- the claim loop's dispatch/abort/backoff behaviour against a fake Floor client (`claim-loop.test.ts`, which also covers the liveness log's once-a-minute rate limit)
- that rate limit's own pure rule (`domain/liveness.test.ts`)
