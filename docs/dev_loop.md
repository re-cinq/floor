# Development loop

Decided 2026-09-27: a dev machine runs **minikube**. An agent visit is a
Kubernetes pod everywhere, so there is one execution path. Hot reload must
work for everything a developer edits.

## The shape, copied from lore's `npm start`

Only what must be in a cluster is in the cluster. Everything a developer
edits runs on the host, where a file save restarts it in under a second.

| piece | where it runs in dev | reload |
|---|---|---|
| Postgres | a container, data in a git-ignored bind mount | none needed |
| the floor (API + loop) | host | `tsc --watch` recompiles, `node --watch dist/` restarts |
| the cluster agent | host, with a kubeconfig holding only the minikube context | same pair |
| service stations | host, claiming from the queue | same pair |
| the ai-agent-subsystem | minikube, installed from the manifests vendored in `deploy/agent-subsystem/` | not ours to edit |
| agent pods | minikube | every visit is a new pod |

None of our code runs inside a pod, so nothing of ours needs reloading
there. A prompt or a station definition is data: saving a new version takes
effect on the next visit.

Pods reach back to the host at `host.minikube.internal`: blob URLs and the
sink resolve there in dev. That is one setting, the floor's public base URL.
Service stations and the cluster agent only call out to the floor, so they
need no address of their own.

## One command

```
npm start
```

In order: starts Postgres, installs the ai-agent-subsystem into minikube if
that has not been done, builds once, then starts a compiler and a process
for each app, both watching. `Ctrl-C` stops the host processes and leaves
Postgres and minikube up, so the next start is fast. Each step can be run
again.

A save reaches the running floor in under a second. A change in a package
restarts every app made of it. A restart gives the lease up and takes it
again, so the loop is never left without an owner.

| setting | what it does |
|---|---|
| `PORT` | the API's port, `8180` when unset: `8080` is lore's floor, and the two run side by side |
| `FLOOR_AGENTS=0` | no cluster agent and no minikube, for work that never reaches an agent |
| `FLOOR_SETUP=1` | runs the minikube setup again |

The floor's token is `floor-dev-token` unless `.env.local` sets
`FLOOR_SERVICE_TOKEN`.

## The other commands

| command | what it does |
|---|---|
| `npm run db:up` | Postgres in a container, on :5433 |
| `npm run minikube-setup` | installs the ai-agent-subsystem into minikube, in the floor's own namespace `floor-agents`, beside any other install; runs the next command |
| `npm run minikube-claude-auth` | gives the agents a Claude credential: an API key, or your own subscription through `claude setup-token`. Run again when a token expires |
| `npm run minikube-gemini-auth` | gives the agents a Gemini API key, beside their Claude credential |
| `floor-pipeline` | a pipeline as one YAML file: `export` one or all from a floor, `import` one, `migrate` a folder in order; see `packages/pipeline` |
| `scripts/walk.sh` | boots a floor of its own and walks a run through a service station, over HTTP |
| `scripts/walk-agent.sh` | boots a floor and a cluster agent of its own and walks a run through a real agent pod, watching it over the live channel |
| `scripts/watch-run.mjs` | watches one run of a running floor as it happens, a line a frame: `FLOOR_SERVICE_TOKEN=<token> node scripts/watch-run.mjs <floor url> <run id>` |
| `scripts/walk-gemini.sh` | the same walk on a Gemini model, with a gcloud login and no API key: a relay on this machine asks Vertex AI as you, and the pod holds a key for that walk alone |
| `scripts/walk-git.sh` | walks a run whose station writes to a repository: git in the pod asks the floor for its credential |

Setup pins a kubeconfig to the minikube context, so neither it nor the
cluster agent can act on whatever cluster `kubectl` points at. The test
suites run in their own database, `floor_test`: they truncate their tables,
which would delete a running floor's runs from under it.

## Alternatives considered

| option | why not |
|---|---|
| everything in minikube, synced by Skaffold or Tilt | production-like, but a save goes through sync and an in-container restart; slower, and one more tool to learn |
| in-cluster services intercepted to local processes (Telepresence, mirrord) | solves the same problem as running on the host, with more moving parts |

## What dev does not cover

Network policy, ingress, several clusters with different tags, and the
bucket blob adapter are not exercised on a dev machine. Those belong to a
CI environment that deploys the real charts.
