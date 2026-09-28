# floor

One chart for all of the floor's apps — the API (`apps/api`), the cluster agent
(`apps/cluster-agent`) and the GitHub receiver/post-review station (`apps/github`) — built from the
one image at the repo root's `Dockerfile`. Postgres is external: this chart never deploys it, only
points its apps at one.

## Install

```
helm install floor deploy/chart \
  --set version=<image tag> \
  --set api.baseUrl=https://floor.example.com \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres --set postgres.secretKey=connectionString
```

`api.existingSecret` must hold two keys: `serviceToken` and `visitTokenSecret`. The cluster agent
authenticates to the api with the same `serviceToken` (`FLOOR_CLUSTER_AGENT_TOKEN`), so this
secret is required whenever either `api.enabled` or `clusterAgent.enabled` is true — not just the
former.

## Values

See `values.yaml` for the full, commented list. The load-bearing ones:

- `version` — the image tag for both apps. One value, never one per app: they are built and
  released together.
- `image.repository`, `imagePullSecrets` — shared by every Deployment and Job this chart renders,
  including the subsystem controller's.
- `api.enabled` / `clusterAgent.enabled` — both default `true`. Turn one off to deploy only the
  other against a floor running elsewhere.
- `api.replicas` — default 2. Only the replica holding the floor's Postgres lease passes
  `/readyz` (a single-active-leader pattern via a Postgres advisory lock), so the Service always
  routes to exactly one pod; the rest sit ready-but-unrouted until it fails over.
- `api.baseUrl` — required when `api.enabled`.
- `api.reapMs` — optional override of `FLOOR_REAP_MS`; empty uses the api's own default.
- `clusterAgent.floorUrl` — defaults to the in-cluster api Service when `api.enabled`; required
  when it is not.
- `github.enabled` — default `false`, unlike the other two: turn it on to also deploy the GitHub
  receiver and post-review station. `github.existingSecret` is then required, and may hold
  `webhookSecret`, `token`, `appId` and `appPrivateKey` — each key optional, matching what
  `apps/github` itself treats as optional (it needs at least one of `webhookSecret` or a token
  source to do anything, but the chart only requires the Secret to exist). No Ingress is
  rendered for it — exposing the receiver is the installer's choice. `github.apiUrl` points it at
  a GitHub Enterprise server; empty uses github.com.
- `postgres.*` — either `existingSecret` + `secretKey` (a Secret already holding a full connection
  string), or `host`/`port`/`database`/`user`/`password`, from which the chart builds one. One or
  the other is required unconditionally: the migration Job always runs, whether or not this
  release also deploys the api.
- `subsystem.*` — the ai-agent-subsystem's controller and CRDs, off by default. `subsystem.version`
  is checked against `subsystem.supportedVersions` (today: `v0.11.6` only) — add to that list
  before pointing the chart at a newer vendored `controller.yaml`.

## What's unconditional

- **The migration Job** (a `pre-install,pre-upgrade` hook running
  `node packages/store/dist/migrate-cli.js`) always runs, regardless of `api.enabled` or
  `clusterAgent.enabled` — this release is assumed to own the schema of the Postgres it's pointed
  at. Its hook weight is set below the chart-built postgres Secret's own hook weight, so the
  Secret exists before the Job reads it (only relevant when the chart builds that Secret itself;
  an `existingSecret` is assumed to already be there).
- **The CRDs** under `crds/` (copied from `deploy/agent-subsystem/crds/`) install via Helm's own
  `crds/` convention: unconditionally, on `helm install`, and never removed by `helm uninstall` or
  reapplied by `helm upgrade`. This is a Helm limitation, not a bug in this chart —
  `subsystem.enabled` only gates the controller Deployment/RBAC (`templates/subsystem-controller.yaml`),
  not the CRDs. Installing the CRDs unconditionally is intentional: the cluster agent creates
  `Agent`/`Station`/`AgentDefinition` objects whether or not this same release also runs their
  controller (another install on the cluster may run it instead — see
  `scripts/setup-minikube-agents.sh`'s own comment to that effect).
- **`agent-secrets`**, the Secret the cluster agent writes per-visit tokens and model API keys
  into, is created empty (`helm.sh/resource-policy: keep`) only when it doesn't already exist
  (checked with Helm's `lookup`, which means this branch always renders under `helm template`,
  since `lookup` has no cluster to check against offline). Once it exists, this template renders
  nothing on later applies, so an upgrade never overwrites what the agent has since written to it.

## A known image-tag caveat

`deploy/agent-subsystem/controller.yaml`'s own vendoring comment warns that the subsystem's
`v0.11.6` tag has, in practice, pointed at `v0.11.3` images — `scripts/setup-minikube-agents.sh`
pins by digest to work around it. This chart follows the spec and selects
`subsystem.controllerImage`/`subsystem.agentImage` by `subsystem.version` **as a tag**, not a
digest. If that mismatch still holds, verify the image before trusting the tag:

```
docker image inspect <image> --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
```

## Checks

```
scripts/check-chart.sh
```

Runs `helm lint` and `helm template` against a minimal values file for each of: both apps, API
only, cluster agent only, github enabled (`ci/values-*.yaml`); asserts each of the five
install-time refusals actually fires; and checks that no rendered ConfigMap, nor any default in
`values.yaml`, carries a password, token, or secret.

Note: `helm lint` against the chart's own bare defaults (no `-f`) is not meaningful here and isn't
part of this check — the defaults are deliberately incomplete (`api.baseUrl`, `postgres.*` are all
empty), so `fail` always fires. `helm lint`, unlike `helm template`/`helm install --dry-run`, logs
a `fail` as an `[INFO]` line and *keeps rendering* rather than stopping, which surfaces as an
unrelated YAML parse error on whatever template runs next rather than the actual refusal message —
always lint (and install) with a complete values file.

## What this chart does not do

Install anything into a cluster, push an image, or touch `apps/` or `packages/` — build the image
from the repo root's `Dockerfile` and push it yourself, then point `version` at that tag.

## Verified on a cluster

Installed into a scratch namespace on minikube, from an image built from this repo's Dockerfile, with Postgres outside the cluster. A run went through a real agent pod with the API, the cluster agent and the subsystem's controller all in-cluster, and the visit's resources were deleted afterwards. The cluster agent ran under the chart's Role, which `kubectl auth can-i --list` shows as exactly: `create` and `delete` on the three agent resources, `get` and `update` on the secret `agent-secrets`.

What that found, and what the chart does about it:

- **Ready means "can serve", not "runs the loop".** `/readyz` used to be the floor's lease, which one instance holds. A second replica was never ready, so `helm install --wait` waited on it until it timed out, and a rolling update would have waited for a new pod that cannot be ready while the old one lives. Now every replica that reaches Postgres is ready, the loop runs on whichever holds the lease, and `GET /version` on a replica says whether it is the one.
- **CRDs are Helm's to create, never to change.** They are in `crds/`, so Helm installs them when the cluster has none, whatever `subsystem.enabled` says, and never upgrades or deletes them. `--skip-crds` leaves the cluster alone entirely.
- **A password may hold any character.** The connection string is built with the user and password percent-encoded.
