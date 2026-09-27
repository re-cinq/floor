# Development loop

Decided 2026-09-27: a dev machine runs **minikube**. An agent visit is a
Kubernetes pod everywhere, so there is one execution path and no local
stand-in for it. Hot reload must work for everything a developer edits.

## The shape, copied from lore's `npm start`

Only what must be in a cluster is in the cluster. Everything a developer
edits runs on the host, where a file save restarts it in under a second.

| piece | where it runs in dev | reload |
|---|---|---|
| Postgres | a container, data in a git-ignored bind mount | none needed |
| the floor (API + loop) | host | `tsc --watch` recompiles, `node --watch dist/` restarts |
| the cluster agent | host, with a kubeconfig holding only the minikube context | same pair |
| service stations | host | same pair |
| agent pods | minikube | every visit is a new pod, so the next visit runs the new code |
| the wrapper, inside agent pods | minikube, mounted from the host | see below |

Pods reach back to the host at `host.minikube.internal`: the brief URL, the
blob URLs, the events endpoint and the records endpoint all resolve there in
dev. That is one setting, the floor's public base URL.

## Reloading the wrapper without rebuilding the image

The wrapper is the one piece of our code that runs inside the pod. Rebuilding
and loading an image on every save is a minute per change. Instead, in dev
only:

1. `minikube mount <repo>/wrapper/dist:/floor-wrapper` runs alongside the stack.
2. The dev values add a `hostPath` volume for `/floor-wrapper` to agent pods
   and point the entrypoint at it.
3. `tsc --watch` keeps `wrapper/dist` fresh on the host.

A save is visible to the next pod that starts. A visit already running keeps
the code it started with, which is what you want from a visit.

The image still ships the wrapper for every other environment. A CI job
runs the same line against the image with no mount, so the mount can never
hide a broken image.

## One command

`npm start` does, in order: start Postgres, run migrations, start minikube
if it is not running, install the agent subsystem chart with the dev values,
start the mount, build once, then start the watch pairs. `Ctrl-C` stops the
host processes and leaves minikube and Postgres up, so the next start is
fast. Each step is idempotent.

## Alternatives considered

| option | why not |
|---|---|
| everything in minikube, synced by Skaffold or Tilt | production-like, but a save goes through sync and an in-container restart; slower, and one more tool every developer must learn |
| in-cluster services intercepted to local processes (Telepresence, mirrord) | solves the same problem as running on the host, with more moving parts |
| rebuild and `minikube image load` on every save | correct and simple, a minute per change |

## What dev does not cover

Network policy, ingress, multi-cluster tags and the bucket blob adapter are
not exercised on a dev machine. Those belong to a CI environment that
deploys the real charts.
