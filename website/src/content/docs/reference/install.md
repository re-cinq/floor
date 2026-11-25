---
title: Install on a cluster
description: Install a released floor into a Kubernetes cluster with Helm, and seed, upgrade and remove it.
wordBudget: 500
sidebar:
  order: 1
---

At the end you have an api answering on your address and a cluster agent that claims work. Every release publishes the chart at `oci://ghcr.io/re-cinq/charts/floor` and the image at `ghcr.io/re-cinq/floor` under one version. Both are public.

## What you need first

| You need | Because |
| --- | --- |
| A Kubernetes cluster and `helm` 3.8 or later | Agents run as pods, and Helm 3.8 installs OCI charts |
| A Postgres database | The chart never deploys one. The user must be able to create tables |
| An address the api is reached at, from inside the cluster | The chart renders a ClusterIP Service. The Ingress or load balancer is yours |
| A model credential | An Anthropic or Gemini API key, or a Claude OAuth token. Without one every agent pod fails |

## Create the secrets

Floor reads two secrets and never creates them.

```bash
kubectl create namespace floor

kubectl -n floor create secret generic floor-api \
  --from-literal=serviceToken="$(openssl rand -hex 32)" \
  --from-literal=visitTokenSecret="$(openssl rand -hex 32)"

kubectl -n floor create secret generic floor-postgres \
  --from-literal=connectionString='postgres://user:password@host:5432/floor'
```

`serviceToken` is what every client sends as `$FLOOR_SERVICE_TOKEN`. `visitTokenSecret` signs the token one agent pod gets for one visit. See [Authentication](/floor/reference/http-api/#authentication).

## Install the chart

Take `<release>` from [the releases](https://github.com/re-cinq/floor/releases), without the `v`.

```bash
helm install floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --namespace floor \
  --set api.baseUrl=https://floor.example.com \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres \
  --set postgres.secretKey=connectionString \
  --set subsystem.enabled=true
```

The chart refuses to install when a required value is missing, and the message names it. Then add the model credential to the secret the chart created:

```bash
kubectl -n floor patch secret agent-secrets --type merge \
  -p '{"stringData":{"ANTHROPIC_API_KEY":"sk-ant-..."}}'
```

Upgrades never overwrite `agent-secrets`.

## Check that it answers

```bash
curl -s https://floor.example.com/healthz
curl -s https://floor.example.com/version
```

Two api pods serve, and one holds the lease that runs the event loop. `runsLoop` in `/version` says whether the pod that answered is that one.

## Values

| Value | What it sets | Default |
| --- | --- | --- |
| `version` | The image tag of both apps. A published chart carries its own | `""` |
| `api.baseUrl` | The address pods reach the api at. Required with `api.enabled` | `""` |
| `api.existingSecret` | The secret with `serviceToken` and `visitTokenSecret` | `""` |
| `api.enabled` | Run the api | `true` |
| `api.replicas` | Api pods. Every one serves | `2` |
| `api.gitCredentialUrl` | A service the api asks for a git credential. With none, a visit that writes to a repository is not dispatched | `""` |
| `postgres.existingSecret`, `postgres.secretKey` | A secret holding a full connection string | `""` |
| `postgres.host`, `port`, `database`, `user`, `password` | Instead of a secret, the parts the chart builds one from | `port` is `5432` |
| `clusterAgent.enabled` | Run the cluster agent | `true` |
| `clusterAgent.floorUrl` | The floor the agent claims from. Required when `api.enabled` is `false` | the in-cluster api |
| `clusterAgent.clusterId` | The name this cluster registers under. Unique per cluster | `default` |
| `clusterAgent.tags` | The tags this cluster offers. The agent adds `cluster:<clusterId>` | `kind:agent` |
| `clusterAgent.modelSecretKeys` | Which key of `agent-secrets` holds each model family's credential, such as `claude=CLAUDE_CODE_OAUTH_TOKEN` | `""` |
| `clusterAgent.agentsNamespace` | Where the agent creates agents | the release namespace |
| `subsystem.enabled` | Install the [ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem) controller that runs agent pods. Leave it off if the cluster already has one | `false` |
| `pipelines.existingConfigMap` | A ConfigMap of pipeline files to seed | `""` |
| `agentNetworkPolicy.enabled` | Limit what an agent pod reaches to DNS, port 443 and the api | `true` |
| `agentNetworkPolicy.extraEgress` | More places a pod may reach, as NetworkPolicy egress rules | `[]` |
| `apiNetworkPolicy.enabled` | Limit who reaches the api. List your ingress namespace in `allowedNamespaces` | `false` |
| `api.serviceMonitor.enabled` | Add a ServiceMonitor so the Prometheus operator scrapes the api. See [Metrics](/floor/reference/metrics/) | `false` |

## Seed assembly lines

Put one pipeline file per line in a ConfigMap and name it. Files run in the order of their names, once each.

```bash
kubectl -n floor create configmap floor-lines \
  --from-file=0001-write-note.yaml
helm upgrade floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --namespace floor --reuse-values --set pipelines.existingConfigMap=floor-lines
```

A file changed after it ran fails the upgrade. Add a later file instead. A ConfigMap holds 1 MiB at most. To put lines in by hand, see [The floor-pipeline command](/floor/reference/cli/).

## Add a cluster

A cluster joins by running a cluster agent. There is nothing to register by hand. The agent calls `PUT /clusters/{id}` on start and every minute, with its `clusterId`. Install the chart again on the other cluster with the api off and its own `clusterId`.

```bash
helm install floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --namespace floor --create-namespace \
  --set api.enabled=false \
  --set clusterAgent.floorUrl=https://floor.example.com \
  --set clusterAgent.clusterId=acme \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres \
  --set postgres.secretKey=connectionString
```

Its `floor-api` secret holds the first floor's `serviceToken`. The Postgres values are required anyway, so point them at the same database. An [agent file](/floor/specs/agent-file/) reaches this cluster with the tag `cluster:acme`.

## Upgrade

```bash
helm upgrade floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --namespace floor --reuse-values
```

A migration Job runs before the upgraded pods start.

## Uninstall

```bash
helm uninstall floor --namespace floor
```

The CRDs and `agent-secrets` stay, and so does the database. Delete them by hand if you want them gone.
