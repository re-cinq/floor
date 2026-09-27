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
| the ai-agent-subsystem | minikube, installed from its release manifest | not ours to edit |
| agent pods | minikube | every visit is a new pod |

None of our code runs inside a pod, so nothing of ours needs reloading
there. A prompt or a station definition is data: saving a new version takes
effect on the next visit.

Pods reach back to the host at `host.minikube.internal`: blob URLs and the
sink resolve there in dev. That is one setting, the floor's public base URL.
Service stations and the cluster agent only call out to the floor, so they
need no address of their own.

## One command

`npm start` does, in order: start Postgres, run migrations, start minikube
if it is not running, install the ai-agent-subsystem, build once, then start
the watch pairs. `Ctrl-C` stops the host processes and leaves minikube and
Postgres up, so the next start is fast. Each step is idempotent.

## Alternatives considered

| option | why not |
|---|---|
| everything in minikube, synced by Skaffold or Tilt | production-like, but a save goes through sync and an in-container restart; slower, and one more tool to learn |
| in-cluster services intercepted to local processes (Telepresence, mirrord) | solves the same problem as running on the host, with more moving parts |

## What dev does not cover

Network policy, ingress, several clusters with different tags, and the
bucket blob adapter are not exercised on a dev machine. Those belong to a
CI environment that deploys the real charts.
