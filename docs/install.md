# Install floor

Install a released floor into a Kubernetes cluster with Helm, from the published chart and image.
At the end you have an api answering on your address and a cluster agent claiming work, and nothing
else to build. For a guided first run after that, read the [tutorial](tutorial.md); for every
chart value, the [chart's README](../deploy/chart/README.md).

Every release publishes the chart at `oci://ghcr.io/re-cinq/charts/floor` and the image at
`ghcr.io/re-cinq/floor`, under the same version, for `linux/amd64` and `linux/arm64`. The chart
version is the image tag it runs; you name it once. Releases are listed at
[github.com/re-cinq/floor/releases](https://github.com/re-cinq/floor/releases).

## Before you start

| you need | because |
|---|---|
| A Kubernetes cluster, and `helm` 3.8 or later | Agents run as pods in it. OCI charts need Helm 3.8. |
| A Postgres database | The chart never deploys one. Any Postgres the pods can reach, with a user that may create tables. |
| An address pods and clients reach the api at | The chart renders a ClusterIP Service for the api. The route to it, an Ingress or a load balancer, is yours. |
| A model credential | An Anthropic or Gemini API key, or a Claude OAuth token. Without one, every agent pod fails. |

Both images are public. No pull secret is needed.

## 1. Create the two Secrets

Floor reads them and never creates them. Put them in the namespace the release will use.

```bash
kubectl create namespace floor

kubectl -n floor create secret generic floor-api \
  --from-literal=serviceToken="$(openssl rand -hex 32)" \
  --from-literal=visitTokenSecret="$(openssl rand -hex 32)"

kubectl -n floor create secret generic floor-postgres \
  --from-literal=connectionString='postgres://user:password@host:5432/floor'
```

| key | what it is |
|---|---|
| `serviceToken` | What every client authenticates with: lore, a worker, the CLI, you. Keep it; you need it in [Use floor](using.md). |
| `visitTokenSecret` | Signs the short-lived token one agent pod gets for one visit. Never handed out. |
| `connectionString` | A full Postgres URL. The migration Job creates the tables with it on install and on every upgrade. |

## 2. Install the chart

```bash
helm install floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --namespace floor \
  --set api.baseUrl=https://floor.example.com \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres \
  --set postgres.secretKey=connectionString \
  --set subsystem.enabled=true
```

`<release>` is a version from the releases page, without the `v`: `0.2.0`. The chart runs the
image of the same version. To run a different image tag, add `--set version=<tag>`.

| value | set it to |
|---|---|
| `api.baseUrl` | The address pods reach the api at. It must resolve from inside the cluster. |
| `subsystem.enabled` | `true` to install the [ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem)'s controller, which runs agent pods. `false` only if another install on this cluster already runs it. |
| `clusterAgent.tags` | Default `kind:agent`. The tags this cluster offers; an agent definition asking for a tag this does not include never runs here. |

The chart refuses to install, before anything is applied, when a required value is missing. The
message names the value.

## 3. Check it

```bash
kubectl -n floor get pods
curl -s https://floor.example.com/healthz
curl -s https://floor.example.com/version
```

You see two api pods, one cluster agent pod, the subsystem controller, and a completed migration
Job. Two api replicas run by default and both serve. Only one runs the event loop, held on a
Postgres advisory lease, and `/version` says whether the replica that answered is the one. Either
answer is correct.

## 4. Give the agents a model credential

The chart creates an empty Secret named `agent-secrets`. The cluster agent writes each visit's
token into it; the model credential is yours to add:

```bash
kubectl -n floor patch secret agent-secrets --type merge \
  -p '{"stringData":{"ANTHROPIC_API_KEY":"sk-ant-..."}}'
```

The Secret is never overwritten on upgrade. Which key an agent reads depends on its model family;
`clusterAgent.modelSecretKeys`, for example `claude=CLAUDE_CODE_OAUTH_TOKEN,gemini=GEMINI_API_KEY`,
overrides the names.

The install is complete. Continue with [Use floor](using.md), or the [tutorial](tutorial.md).

## Upgrade

```bash
helm upgrade floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --namespace floor --reuse-values
```

The migration Job runs before the new pods start and holds a Postgres advisory lock, so two
migrations never run at once. `agent-secrets` and what you put in it survive.

## A second cluster

A cluster joins a floor by running a cluster agent that claims work from it. There is no
registration: install the chart again on the other cluster, api off, pointed at the first floor,
offering a tag of its own.

```bash
helm install floor-acme oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --namespace floor --create-namespace \
  --set api.enabled=false \
  --set clusterAgent.floorUrl=https://floor.example.com \
  --set clusterAgent.tags="kind:agent,cluster:acme" \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres \
  --set postgres.secretKey=connectionString \
  --set subsystem.enabled=true
```

`floor-api` on that cluster holds the first floor's `serviceToken`: the cluster agent authenticates
with it. The Postgres values are required all the same, because the migration Job runs on every
install. Point them at the same database.

An agent definition reaches this cluster by asking for its tag:

```yaml
settings:
  tags: [cluster:acme]
```

## Uninstall

```bash
helm uninstall floor --namespace floor
```

Two things stay, by design. The CRDs stay, as Helm's `crds/` convention keeps them. The
`agent-secrets` Secret stays, as it is marked keep. Delete both by hand if you want them gone. The
database is untouched.

## What the chart does not do

- **Deploy Postgres.** Bring one.
- **Route traffic in.** The api Service is ClusterIP. The Ingress or load balancer is yours.
- **Talk to GitHub.** Floor mints no credentials and posts to no provider. lore does that, and
  answers floor's git-credential request; see [decisions.md](decisions.md), "GitHub".
- **Install the pipeline CLI or the SDKs.** Those are npm packages; see [Use floor](using.md).
