# floor

One chart for both of the floor's apps — the API (`apps/api`) and the cluster agent
(`apps/cluster-agent`) — built from the one image at the repo root's `Dockerfile`. Postgres is external: this chart never deploys it, only
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
- `api.replicas` — default 2. Every replica that reaches Postgres passes `/readyz` and serves,
  so the Service routes across all of them. The event loop runs only on the replica holding the
  floor's Postgres advisory lease; `GET /version` on a replica says whether it is the one.
- `api.baseUrl` — required when `api.enabled`.
- `api.reapMs` — optional override of `FLOOR_REAP_MS`; empty uses the api's own default.
- `clusterAgent.floorUrl` — defaults to the in-cluster api Service when `api.enabled`; required
  when it is not.
- `api.gitCredentialUrl` — where the api asks for a git credential for a visit's repository. The
  provider is a service outside this chart, lore's. Empty means nothing provides them, and a visit
  that would write to a repository is not dispatched.
- `api.gitCredentialSecret` — the Secret holding the token the api presents to that provider
  (`FLOOR_GIT_CREDENTIAL_TOKEN`), never the service token. `name` defaults to `api.existingSecret`;
  `key` defaults to `gitCredentialToken`, so that Secret must hold that key. Needed only when
  `api.gitCredentialUrl` is set: the api refuses to start with the URL and no token.
- `postgres.*` — either `existingSecret` + `secretKey` (a Secret already holding a full connection
  string), or `host`/`port`/`database`/`user`/`password`, from which the chart builds one. One or
  the other is required unconditionally: the migration Job always runs, whether or not this
  release also deploys the api.
- `agentNetworkPolicy.*` — what an agent's pod may reach, on by default. See
  [What an agent's pod may reach](#what-an-agents-pod-may-reach).
- `pipelines.existingConfigMap` — a ConfigMap you keep, holding one YAML file a pipeline. Empty
  (the default) renders no seed Job. See [Seeding pipelines](#seeding-pipelines).
- `subsystem.*` — the ai-agent-subsystem's controller and CRDs, off by default. `subsystem.version`
  is checked against `subsystem.supportedVersions` (today: `v0.11.6` and `v0.11.8`) — add to that list
  before pointing the chart at a newer vendored `controller.yaml`.

## Walked on minikube

`scripts/walk-chart.sh` installs this chart whole, from an image built of the checkout, in a
namespace of its own, and walks a run through it. What it has to do beside `helm install` is what
an operator has to do:

- **Bind the pull secret to the namespace's `default` service account.** `imagePullSecrets`
  reaches the pods this chart renders. An agent's pod is rendered by the subsystem's controller,
  under `default`, and the subsystem's images are private:
  `kubectl -n <namespace> patch serviceaccount default -p '{"imagePullSecrets":[{"name":"<secret>"}]}'`.
- **Label the namespace** `agents.re-cinq.com/system=true`, as the subsystem expects.
- **Put the model's credential in `agent-secrets`**, under the key `clusterAgent.modelSecretKeys`
  names. With that value empty the cluster agent looks for `ANTHROPIC_API_KEY`; a Claude OAuth
  token under `CLAUDE_CODE_OAUTH_TOKEN` needs `claude=CLAUDE_CODE_OAUTH_TOKEN`. A pod whose key
  is missing stays in `CreateContainerConfigError` until its visit's deadline.

## What an agent's pod may reach

The code in an agent's pod is whatever a model wrote a minute ago. With `clusterAgent.enabled`,
the chart renders one NetworkPolicy in the release's namespace, selecting every pod the
subsystem's controller runs, by the label it puts on them: `agents.re-cinq.com/component: job`.

| a pod reaches | how |
|---|---|
| the cluster's DNS | `kube-system`, `k8s-app: kube-dns`, port 53 |
| the node's DNS cache | `agentNetworkPolicy.nodeLocalDnsAddress`, port 53. Where a cluster runs NodeLocal DNSCache, this is the one a pod actually asks |
| the public internet | port 443, without the private ranges and without `169.254.0.0/16`, where a cloud's metadata endpoint is |
| this release's api | its pods, port 8080, when `api.enabled` |
| what you list | `agentNetworkPolicy.extraEgress`, NetworkPolicy egress rules as they are written |

Nothing reaches a pod.

- **List what else your agents call.** lore's MCP gateway and skills registry are inside the
  cluster, so they are not the public internet, and a pod does not reach them until they are in
  `extraEgress`.
- **A floor that is not this release's api must be listed too**: a cluster-agent-only release, or
  an `api.baseUrl` on a private address.
- **NodeLocal DNSCache needs its own rule.** It answers on a link-local address on the node,
  so the cluster-DNS rule never sees that traffic and the internet rule excludes the whole
  link-local range. A pod then resolves nothing at all. GKE runs it, and uses `169.254.20.10`.
- **The network plugin must enforce NetworkPolicy.** Where it does not, the policy is accepted
  and binds nothing. minikube's default plugin does not; start it with `--cni=calico` to see it
  bind.
- **The subsystem's own policy is for its own namespace**, `ai-agents`. This one is the same
  rules, for the namespace this release runs its agents in, with the floor added.
- `agentNetworkPolicy.enabled=false` renders none, for a cluster whose policies are kept
  elsewhere.

## The live channel

Watching a run is a WebSocket on the api Service, on the same port as everything else:
`GET /assembly-runs/<id>/live`, with the service token. It needs no value and no extra Service.
Whatever stands between lore and the api Service must pass an upgrade through, and should not
close a connection idle for less than 30 seconds: the floor pings every 25. Each api replica
holds one more Postgres connection once it has a viewer, named `floor-run-listener`.

## Seeding pipelines

When `pipelines.existingConfigMap` is set and `api.enabled` is true, the chart renders a Job (a
`post-install,post-upgrade` hook) that runs
`node packages/pipeline/dist/cli.js migrate /pipelines --floor <the api Service> --wait-ready 180`
with the ConfigMap mounted read-only at `/pipelines`. The service token comes from
`api.existingSecret`, key `serviceToken`.

- **One file a pipeline**, and the file names are the order they run in (`0001-code-review.yaml`,
  `0002-...`). Each file runs once: the floor remembers which did.
- **A file changed after it ran fails the Job, and so the upgrade.** That is by design: what the
  file did is done, and a change is a new file.
- **It waits for the api.** A hook runs when resources are created, not when they are ready, so
  the tool polls `/readyz` for up to 180 seconds before it puts anything.
- **A ConfigMap holds at most 1 MiB**, all files together. A larger set of pipelines does not fit.
- **The pipeline tool must be in the image.** The Job runs `packages/pipeline/dist/cli.js` from the
  same image as the api; an image built without that package fails the Job.

## What's unconditional

- **The migration Job** (a `pre-install,pre-upgrade` hook running
  `node packages/store/dist/migrate-cli.js`) always runs, regardless of `api.enabled` or
  `clusterAgent.enabled` — this release is assumed to own the schema of the Postgres it's pointed
  at. Its hook weight is set below the chart-built postgres Secret's own hook weight, so the
  Secret exists before the Job reads it (only relevant when the chart builds that Secret itself;
  an `existingSecret` is assumed to already be there).
- **Migrating is safe to run more than once at a time.** The Job and every API replica migrate,
  and `migrate` holds a Postgres advisory lock for its whole run, so the second waits for the
  first.
- **The cluster agent is given sixty seconds to stop** (`terminationGracePeriodSeconds`). Told to
  stop, it finishes the dispatch in flight, which creates three resources and writes a secret, and
  claims nothing more.
- **The CRDs** under `crds/` (copied from `deploy/agent-subsystem/crds/`) install via Helm's own
  `crds/` convention: unconditionally, on `helm install`, and never removed by `helm uninstall` or
  reapplied by `helm upgrade`. This is a Helm limitation, not a bug in this chart —
  `subsystem.enabled` only gates the controller Deployment/RBAC (`templates/subsystem-controller.yaml`),
  not the CRDs. **On a cluster that already has them**, installing them again is a
  field-ownership conflict, since whoever installed them owns them: `deploy.yml` looks for
  `agents.agents.re-cinq.com` first and passes `--skip-crds` when it is there. Install by hand
  with the same flag on such a cluster. Installing the CRDs unconditionally is intentional: the cluster agent creates
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
only, cluster agent only, and both with pipelines seeded (`ci/values-*.yaml`); asserts each of the six
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

## Continuous delivery

Three workflows, and the image is always `ghcr.io/re-cinq/floor`.

| what happens | the workflow | the image's tags | deployed as |
|---|---|---|---|
| a commit to `main` that touches the code, the Dockerfile or the chart | `build.yml` | its short SHA, and `latest` | its short SHA |
| a GitHub Release `v1.2.3` is published | `publish.yml` | `1.2.3` and `1.2` | `1.2.3` |
| `build.yml` run by hand on a branch | `build.yml` | the commit's short SHA | not deployed |

- **Both deploy through `deploy.yml`**, which installs one version with this chart.
  Authentication to GCP is Workload Identity Federation, the same setup lore uses — no
  service-account key is stored anywhere.
- **The deploy is skipped until the repository names a cluster** in `GKE_CLUSTER_NAME`. The
  image is published all the same.
- **Both deploy into the same release**, so what serves is what was deployed last. Release
  `v1.2.3` and the cluster runs `1.2.3`; push to `main` after and it runs a SHA again. The two
  never run at once: deploys wait for each other.
- **A release publishes the npm packages too.** See [Releasing](../../docs/releasing.md).

It needs these set on the repository. The secrets are shared with lore; the variables are floor's
own.

| | name | what it is |
|---|---|---|
| secret | `GCP_WORKLOAD_IDENTITY_PROVIDER` | the provider the run's OIDC token is traded at |
| secret | `GCP_SERVICE_ACCOUNT` | the service account it impersonates |
| variable | `GCP_PROJECT_ID`, `GKE_CLUSTER_NAME` | the cluster to deploy into |
| variable | `GKE_LOCATION` | optional; `europe-west1` when unset |
| variable | `FLOOR_BASE_URL` | `api.baseUrl` — the address **pods** reach the api at |
| variable | `FLOOR_NAMESPACE` | optional; `floor` when unset |
| variable | `FLOOR_PULL_SECRET` | optional; `ghcr` when unset |
| variable | `FLOOR_PIPELINES_CONFIGMAP` | optional; `pipelines.existingConfigMap`. Unset seeds nothing |
| variable | `FLOOR_GIT_CREDENTIAL_URL` | optional; `api.gitCredentialUrl`. Unset leaves no provider, so a visit that would write to a repository is not dispatched. Its token is the `gitCredentialToken` key of `FLOOR_API_SECRET` |
| variable | `FLOOR_API_SECRET`, `FLOOR_POSTGRES_SECRET`, `FLOOR_POSTGRES_SECRET_KEY` | optional; the Secret names, defaulting to `floor-api`, `floor-postgres` and `connectionString` |

**A Postgres must exist before the first deploy.** This chart never deploys one, and the
migration Job is a `pre-install` hook, so a floor pointed at nothing fails before anything is
installed. Either instance will do: its own, or a database of its own on one that is already
there. Give it a database and a role of its own, never a database another service uses, since
floor's schema has tables called `events`, `blobs` and `definitions`.

Two things must already exist in the cluster, because the workflow creates neither: the two Secrets
above (see [the tutorial](../../docs/tutorial.md)), and **an image pull secret for GHCR** if the
image's package is private, since a GKE node cannot pull it with the node service account alone.

The deploy runs `helm upgrade --install --wait`, so a release that does not become ready fails the
run rather than reporting success, and the migration Job is waited on with everything else.

`.github/workflows/ci.yml` gates pull requests: one test job a workspace so a red suite cannot mask
the others, then typecheck, lint, `scripts/check-chart.sh`, and a Docker build. Every job builds
before it tests — cross-package suites import a workspace through its `dist`, so a run without a
build tests the last build rather than the branch.

## Verified on a cluster

Installed into a scratch namespace on minikube, from an image built from this repo's Dockerfile, with Postgres outside the cluster. A run went through a real agent pod with the API, the cluster agent and the subsystem's controller all in-cluster, and the visit's resources were deleted afterwards. The cluster agent ran under the chart's Role, which `kubectl auth can-i --list` shows as exactly: `create` and `delete` on the three agent resources, `get` and `update` on the secret `agent-secrets`.

What that found, and what the chart does about it:

- **Ready means "can serve", not "runs the loop".** `/readyz` used to be the floor's lease, which one instance holds. A second replica was never ready, so `helm install --wait` waited on it until it timed out, and a rolling update would have waited for a new pod that cannot be ready while the old one lives. Now every replica that reaches Postgres is ready, the loop runs on whichever holds the lease, and `GET /version` on a replica says whether it is the one.
- **CRDs are Helm's to create, never to change.** They are in `crds/`, so Helm installs them when the cluster has none, whatever `subsystem.enabled` says, and never upgrades or deletes them. `--skip-crds` leaves the cluster alone entirely.
- **A password may hold any character.** The connection string is built with the user and password percent-encoded.
