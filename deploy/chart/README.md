# floor

One chart for both of the floor's apps, the API (`apps/api`) and the cluster agent (`apps/cluster-agent`), built from the one image at the repo root's `Dockerfile`. Postgres is external. This chart never deploys it and only points its apps at one.

## Install

A release publishes this chart at `oci://ghcr.io/re-cinq/charts/floor`, at the release's version, running the image of the same version:

```
helm install floor oci://ghcr.io/re-cinq/charts/floor --version 0.2.0 \
  --set api.baseUrl=https://floor.example.com \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres --set postgres.secretKey=connectionString
```

From a checkout, the chart carries no `appVersion`, so `version` names the image tag:

```
helm install floor deploy/chart \
  --set version=<image tag> \
  --set api.baseUrl=https://floor.example.com \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres --set postgres.secretKey=connectionString
```

The operator's guide is [Install on a cluster](https://re-cinq.github.io/floor/reference/install/). That is how someone else installs floor. re:cinq's own floor is not installed by hand, see [How re:cinq deploys it](#how-recinq-deploys-it).

`api.existingSecret` must hold two keys, `serviceToken` and `visitTokenSecret`. The cluster agent authenticates to the api with the same `serviceToken` (`FLOOR_CLUSTER_AGENT_TOKEN`), so this secret is required whenever `api.enabled` or `clusterAgent.enabled` is true.

## Values

`values.yaml` has the full, commented list. These are the ones an install depends on.

| value | what it does |
|---|---|
| `version` | The image tag for both apps. One value, never one per app, because they are built and released together. Empty, the chart's `appVersion` is the tag, which a published chart carries and a checkout does not. |
| `image.repository`, `imagePullSecrets` | Shared by every Deployment and Job this chart renders, including the subsystem controller's. |
| `api.enabled`, `clusterAgent.enabled` | Both default `true`. Turn one off to deploy only the other against a floor running elsewhere. |
| `api.replicas` | Default 2. Every replica that reaches Postgres passes `/readyz` and serves, so the Service routes across all of them. The event loop runs only on the replica holding the floor's Postgres advisory lease, and `GET /version` on a replica says whether it is the one. |
| `api.baseUrl` | Required when `api.enabled`. |
| `api.reapMs` | Optional override of `FLOOR_REAP_MS`. Empty uses the api's own default. |
| `clusterAgent.floorUrl` | Defaults to the in-cluster api Service when `api.enabled`. Required when it is not. |
| `api.gitCredentialUrl` | Where the api asks for a git credential for a visit's repository. The provider is a service outside this chart, lore's. Empty means nothing provides them, and a visit that would write to a repository is not dispatched. |
| `api.gitCredentialSecret` | The Secret holding the token the api presents to that provider (`FLOOR_GIT_CREDENTIAL_TOKEN`), never the service token. `name` defaults to `api.existingSecret` and `key` defaults to `gitCredentialToken`, so that Secret must hold that key. Needed only when `api.gitCredentialUrl` is set. The api refuses to start with the URL and no token. |
| `api.gatewayKeysSecret` | The Secret holding the keys behind the gateway token, which the api signs for a visit whose agent definition gives an MCP server a `visit_token`. `name` is empty by default, and the api then signs none and refuses such a visit. `signingKey` (default `gatewaySigningKey`) is the key of the Secret holding an Ed25519 private key as PKCS#8 PEM (`FLOOR_GATEWAY_SIGNING_KEY`). `retiredKeys` (default `gatewayRetiredKeys`) is the key holding a JSON array of public JWKs (`FLOOR_GATEWAY_RETIRED_KEYS`), which the Secret may leave out. See [Gateway token keys](#gateway-token-keys). |
| `postgres.*` | Either `existingSecret` + `secretKey` (a Secret already holding a full connection string), or `host`/`port`/`database`/`user`/`password`, from which the chart builds one. One or the other is always required, because the migration Job always runs, whether or not this release also deploys the api. |
| `agentNetworkPolicy.*` | What an agent's pod may reach, on by default. See [What an agent's pod may reach](#what-an-agents-pod-may-reach). |
| `global.nodeSelector`, `global.tolerations` | Where the chart's controllers run: the api, the cluster agent, the subsystem controller and the two hook Jobs. `api.*`, `clusterAgent.*`, `subsystem.*` and `jobs.*` each take their own `nodeSelector` / `tolerations`, which replace the global one for that component when set. Agent run pods are not covered. The subsystem's controller places those, so a tainted management pool keeps them off it. |
| `api.resources`, `clusterAgent.resources`, `jobs.resources` | Requests and limits. Defaults: api 100m CPU / 256Mi request, 1Gi memory limit; cluster agent and Jobs 50m / 128Mi, 512Mi limit. No CPU limits. Memory is the limit that matters, so raise it for a large database or many viewers. |
| `apiNetworkPolicy.enabled` (default `false`), `apiNetworkPolicy.allowedNamespaces` | A NetworkPolicy on the api's pods, port 8080. Admitted: this release's cluster agent and seed Job, agent run pods, and every namespace listed (your ingress controller's, and any other caller's). A cluster agent in another cluster reaches the api through your ingress, so that namespace must be listed. It binds only where the network plugin enforces NetworkPolicy. |
| `pipelines.existingConfigMap` | A ConfigMap you keep, holding one YAML file a pipeline. Empty (the default) renders no seed Job. See [Seeding pipelines](#seeding-pipelines). |
| `clusterAgent.agentsNamespace` | The namespace the agent creates Agents in, where the subsystem's controller watches. The Role, the `agent-secrets` Secret and the agent network policy render there. Empty (the default) means this release's namespace, with the controller from `subsystem.*`. Set it to `ai-agents` when the ai-agent-subsystem is installed on its own and leave `subsystem.enabled` off. |
| `clusterAgent.subsystemNamespace` | Where the subsystem's chart publishes its `agent-subsystem-versions` ConfigMap (`FLOOR_SUBSYSTEM_NAMESPACE`). Empty means the agents namespace. The chart renders a Role there with `get` on that one ConfigMap. The agent reports its contents to the floor on every register, and `/version` lists them per cluster. |
| `subsystem.modelCatalog` | On by default. Sets `MODEL_CATALOG_ENABLED` on the bundled controller and grants it `get` on the `agent-secrets` Secret, so it keeps the `ModelCatalog default` the cluster agent reports and the floor checks a visit's model against. On a cluster whose `agent-secrets` holds `AGENT_PROVIDER=foundry` the catalog probes each model's deployment: one billed one-token call per model per refresh, hourly. Where the subsystem is installed on its own, turn its `modelCatalog.enabled` on there instead. |
| `subsystem.*` | The ai-agent-subsystem's controller and CRDs, off by default. `subsystem.version` is checked against `subsystem.supportedVersions` (today `v0.11.6`, `v0.11.8`, `v0.11.9`, `v0.11.10`, `v0.11.11`, `v0.15.0`, `v0.21.0`, `v0.21.1` and `v0.21.3`). Add to that list before pointing the chart at a newer vendored `controller.yaml`. |

Two things render without a value of their own:

- The api and the two hook Jobs run under ServiceAccounts that mount no token (`<release>-api`, `<release>-hooks`), because they never call the Kubernetes API. The hooks account is itself a pre-install hook, so that it exists before the migration Job, and `helm uninstall` leaves it behind. The cluster agent and the subsystem controller keep theirs.
- A PodDisruptionBudget (`maxUnavailable: 1`) renders for the api when `api.replicas` is above 1.

## Walked on minikube

`scripts/walk-chart.sh` installs this chart whole, from an image built of the checkout, in a namespace of its own, and walks a run through it. Beside `helm install` it does two things, and an operator has to do the same.

It binds the pull secret to the namespace's `default` service account, when the images need one. `imagePullSecrets` reaches the pods this chart renders, but an agent's pod is rendered by the subsystem's controller, under `default`. The published images are all public, so this is for a mirror of them:

```
kubectl -n <namespace> patch serviceaccount default -p '{"imagePullSecrets":[{"name":"<secret>"}]}'
```

It puts the model's credential in `agent-secrets`, under the key `clusterAgent.modelSecretKeys` names. With that value empty the cluster agent looks for `ANTHROPIC_API_KEY`. A Claude OAuth token under `CLAUDE_CODE_OAUTH_TOKEN` needs `claude=CLAUDE_CODE_OAUTH_TOKEN`. A pod whose key is missing stays in `CreateContainerConfigError` until its visit's deadline.

## What an agent's pod may reach

The code in an agent's pod is whatever a model wrote a minute ago. With `clusterAgent.enabled`, the chart renders one NetworkPolicy in the agents namespace (the release's own unless `clusterAgent.agentsNamespace` is set). It selects every pod the subsystem's controller runs, by the label it puts on them, `agents.re-cinq.com/component: job`.

| a pod reaches | how |
|---|---|
| the cluster's DNS | `kube-system`, `k8s-app: kube-dns`, port 53 |
| the node's DNS cache | `agentNetworkPolicy.nodeLocalDnsAddress`, port 53. Where a cluster runs NodeLocal DNSCache, this is the one a pod actually asks |
| the public internet | port 443, without the private ranges and without `169.254.0.0/16`, where a cloud's metadata endpoint is |
| this release's api | its pods, port 8080, when `api.enabled` |
| what you list | `agentNetworkPolicy.extraEgress`, NetworkPolicy egress rules as they are written |

Nothing reaches a pod.

- List what else your agents call. lore's MCP gateway and skills registry are inside the cluster, so they are not the public internet, and a pod does not reach them until they are in `extraEgress`.
- A floor that is not this release's api must be listed too. That is a cluster-agent-only release, or an `api.baseUrl` on a private address.
- NodeLocal DNSCache needs its own rule. It answers on a link-local address on the node, so the cluster-DNS rule never sees that traffic and the internet rule excludes the whole link-local range. A pod then resolves nothing at all. GKE runs it, and uses `169.254.20.10`.
- The network plugin must enforce NetworkPolicy. Where it does not, the policy is accepted and binds nothing. minikube's default plugin does not, so start it with `--cni=calico` to see it bind.
- The subsystem's own policy is for its own namespace, `ai-agents`. This one is the same rules, for the namespace this release runs its agents in, with the floor added.
- `agentNetworkPolicy.enabled=false` renders none, for a cluster whose policies are kept elsewhere.

## The live channel

Watching a run is a WebSocket on the api Service, on the same port as everything else: `GET /assembly-runs/<id>/live`, with the service token. It needs no value and no extra Service. Whatever stands between lore and the api Service must pass an upgrade through, and should not close a connection idle for less than 30 seconds, because the floor pings every 25. Each api replica holds one more Postgres connection once it has a viewer, named `floor-run-listener`.

## Gateway token keys

An agent definition may give an MCP server a `visit_token`. The api then signs a token for each visit, and the server verifies it with the public keys the api serves at `GET /.well-known/jwks.json`. The api signs with an Ed25519 private key, which it reads from a Secret you keep:

```bash
openssl genpkey -algorithm ed25519 -out gateway-signing-key.pem
kubectl -n floor create secret generic floor-gateway-keys \
  --from-file=gatewaySigningKey=gateway-signing-key.pem
```

Set `api.gatewayKeysSecret.name=floor-gateway-keys`. Without it the api starts, serves an empty key set, and refuses a visit whose definition asks for a token, naming `FLOOR_GATEWAY_SIGNING_KEY`. The api does not start with a key that is not Ed25519.

To rotate the key:

1. Read the public key in use, the first entry of the key set: `curl -s https://floor.example.com/.well-known/jwks.json`.
2. Generate a new private key and put it under `gatewaySigningKey`.
3. Put a JSON array holding that public entry, and every entry still retired, under `gatewayRetiredKeys`. An entry with a private member `d` stops the api from starting.
4. Restart the api: `kubectl -n floor rollout restart deployment/floor-api`.

Tokens the old key signed verify until they expire. The api signs no token that lives more than 24 hours, and a token expires at its visit's deadline, so remove a key from `gatewayRetiredKeys` no sooner than 24 hours after it stopped signing.

## Seeding pipelines

When `pipelines.existingConfigMap` is set and `api.enabled` is true, the chart renders a Job (a `post-install,post-upgrade` hook) with the ConfigMap mounted read-only at `/pipelines`. The service token comes from `api.existingSecret`, key `serviceToken`. The Job runs:

```
node packages/pipeline/dist/cli.js migrate /pipelines --floor <the api Service> --wait-ready 180
```

- One file a pipeline, and the file names are the order they run in (`0001-code-review.yaml`, `0002-...`). Each file runs once, and the floor remembers which did.
- A file changed after it ran fails the Job, and so the upgrade. That is by design. What the file did is done, and a change is a new file.
- It waits for the api. A hook runs when resources are created, not when they are ready, so the tool polls `/readyz` for up to 180 seconds before it puts anything.
- A ConfigMap holds at most 1 MiB, all files together. A larger set of pipelines does not fit.
- The pipeline tool must be in the image. The Job runs `packages/pipeline/dist/cli.js` from the same image as the api, and an image built without that package fails the Job.

## What's unconditional

**The migration Job** is a `pre-install,pre-upgrade` hook running `node packages/store/dist/migrate-cli.js`. It always runs, regardless of `api.enabled` or `clusterAgent.enabled`, because this release is assumed to own the schema of the Postgres it is pointed at. Its hook weight is set below the chart-built postgres Secret's own hook weight, so the Secret exists before the Job reads it. That only matters when the chart builds the Secret itself, since an `existingSecret` is assumed to already be there.

**Migrating is safe to run more than once at a time.** The Job and every API replica migrate, and `migrate` holds a Postgres advisory lock for its whole run, so the second waits for the first.

**The cluster agent is given sixty seconds to stop** (`terminationGracePeriodSeconds`). Told to stop, it finishes the dispatch in flight, which creates three resources and writes a secret, and claims nothing more.

**The CRDs** under `crds/` (copied from `deploy/agent-subsystem/crds/`) install through Helm's own `crds/` convention. Helm installs them unconditionally on `helm install`, never removes them on `helm uninstall` and never reapplies them on `helm upgrade`. This is a Helm limitation. `subsystem.enabled` only gates the controller Deployment and RBAC (`templates/subsystem-controller.yaml`), not the CRDs.

Installing the CRDs unconditionally is intentional. The cluster agent creates `Agent`/`Station`/`AgentDefinition` objects whether or not this same release also runs their controller, since another install on the cluster may run it instead (see the comment in `scripts/setup-minikube-agents.sh`).

On a cluster that already has the CRDs, installing them again is a field-ownership conflict, since whoever installed them owns them. The leftover `deploy.yml` looks for `agents.agents.re-cinq.com` first and passes `--skip-crds` when it is there. Install by hand with the same flag on such a cluster. On the internal cluster they belong to the ai-agent-subsystem's own Argo application, never to this chart.

**`agent-secrets`** is the Secret the cluster agent writes per-visit tokens and model API keys into. It is created empty (`helm.sh/resource-policy: keep`) only when it does not already exist. The check uses Helm's `lookup`, which has no cluster to ask offline, so this branch always renders under `helm template`. Once the Secret exists, this template renders nothing on later applies, so an upgrade never overwrites what the agent has since written to it.

## A known image-tag caveat

The vendoring comment in `deploy/agent-subsystem/controller.yaml` warns that the subsystem's `v0.11.6` tag has, in practice, pointed at `v0.11.3` images. `scripts/setup-minikube-agents.sh` pins by digest to work around it. This chart follows the spec and selects `subsystem.controllerImage`/`subsystem.agentImage` by `subsystem.version` as a tag, not a digest. If that mismatch still holds, verify the image before trusting the tag:

```
docker image inspect <image> --format '{{index .Config.Labels "org.opencontainers.image.version"}}'
```

## Checks

```
scripts/check-chart.sh
```

It runs `helm lint` and `helm template` against a minimal values file (`ci/values-*.yaml`) for each of: both apps, API only, cluster agent only, and both with pipelines seeded. It asserts that each of the six install-time refusals fires. It checks that no rendered ConfigMap, nor any default in `values.yaml`, carries a password, token, or secret.

Always lint and install with a complete values file. `helm lint` against the chart's bare defaults (no `-f`) is not part of this check, because the defaults are deliberately incomplete (`api.baseUrl` and `postgres.*` are all empty), so `fail` always fires. Unlike `helm template` and `helm install --dry-run`, `helm lint` logs a `fail` as an `[INFO]` line and keeps rendering. What you then see is an unrelated YAML parse error from whatever template runs next, and not the refusal message.

## What this chart does not do

Install anything into a cluster, push an image, or touch `apps/` or `packages/`. A release publishes the image and this chart together. For anything else, build the image from the repo root's `Dockerfile` and push it yourself, then point `version` at that tag.

## How re:cinq deploys it

re:cinq's own floor runs on the GKE Autopilot cluster `internal-cluster` in the GCP project `re-cinq-internal`, and Argo CD deploys it. Argo CD is installed by [re-cinq/infrastructure](https://github.com/re-cinq/infrastructure) (its `docs/deploying.md`), which also owns the cluster, Prometheus, Grafana and External Secrets.

Nobody runs `helm install` or `helm upgrade` against that cluster. Argo owns the `floor` application with automated sync, prune and self-heal, so anything applied by hand is reverted at the next sync, and `helm list` there shows nothing. The old `floor` release on `n8n-cluster` (project `re5-n8n-platform`) is scaled to zero and is deleted with the project. Nothing is deployed there any more.

### What Argo CD watches

An ApplicationSet scans every repository in the re-cinq GitHub organization. A repository is deployed when it has `deploy/chart/Chart.yaml` and `deploy/clusters/internal-cluster.values.yaml`, and this one has both. Argo renders this chart, from `main`, with that values file, into an Application and a namespace both named after the repository, `floor`. A merge to `main` is synced within about three minutes. The UI is <https://argocd.gcp.re-cinq.com> (Google sign-in, re-cinq.com accounts).

### How a release reaches the cluster

Merging to `main` is the deploy. There is no deploy job to run and no button to press. What runs is what `deploy/clusters/internal-cluster.values.yaml` says.

`version` pins the image tag, `0.5.3` today, a release `publish.yml` published. Nothing in CI changes that line. A new version reaches the cluster when a pull request bumps it and merges. Either kind of tag works: a release's `1.2.3` ([Releasing](../../docs/releasing.md)), or the short SHA of a `main` commit, which `build.yml` pushes to `ghcr.io/re-cinq/floor` on every merge that touches the code or the chart.

Any other change to `deploy/chart/` or the values file on `main` is deployed the same way, at the pinned image.

Both apps roll together, as always: one chart, one image, one `version`. The migration Job runs as a `pre-upgrade` hook before the new pods start, so a sync waits for the schema too.

### Checking a rollout

The Argo CD UI shows the application, its sync state and the health of every object. From a terminal:

```
gcloud container clusters get-credentials internal-cluster --region europe-west1 --project re-cinq-internal
kubectl -n floor rollout status deployment/floor-api
kubectl -n floor rollout status deployment/floor-cluster-agent
kubectl -n floor get pods -l app.kubernetes.io/name=floor -o wide
kubectl -n floor exec deploy/floor-api -- wget -qO- http://127.0.0.1:8080/version
```

`/version` says which image answered and whether that replica holds the loop's lease. Logs and pods are also in Headlamp, <https://headlamp.gcp.re-cinq.com>, and the api's metrics in Grafana, <https://grafana.gcp.re-cinq.com> (both Google sign-in). The internal values turn on `api.serviceMonitor.enabled`, so the cluster's Prometheus scrapes the api Service's `/metrics` with no further setup.

### Rolling back

Revert the commit that changed `version` (or whatever else broke), merge the revert, and Argo syncs the previous state. That is the rollback that lasts. The Argo CD UI's History and Rollback puts an earlier revision back at once, but it also turns automated sync off for the application, so follow it with the revert and turn sync back on. `helm rollback` does not apply, because Argo does not install Helm releases.

### Secrets

This chart only takes existing Secrets, and on the internal cluster it renders none of them. Values live in Secret Manager in project `re-cinq-internal`, in containers declared by re-cinq/infrastructure in `projects/internal/secrets.tf`. Those are floor's own `floor-db-password` and `floor-visit-token-secret`, and the shared `lore-floor-service-token` and `lore-floor-git-credential-token`. Nothing but a container is in Terraform. A person adds the value:

```
gcloud secrets versions add floor-visit-token-secret --project=re-cinq-internal --data-file=-
```

ExternalSecrets read them through `ClusterSecretStore/gcp-secret-manager` (API `external-secrets.io/v1beta1`) into the `floor` namespace. Today those ExternalSecrets are rendered by re-cinq/lore's umbrella chart, which owns the floor's credentials (lore's `deploy/clusters/internal-cluster.values.yaml`):

- `floor-api` with `serviceToken`, `visitTokenSecret` and `gitCredentialToken`
- `floor-postgres` with the `connectionString` built around `floor-db-password`
- the `ghcr` pull secret

The `floor-pipelines` ConfigMap the values name comes from the same place. A new secret is three pull requests: the container in re-cinq/infrastructure, the value with `gcloud`, and the ExternalSecret that reads it.

### The ai-agents namespace

The ai-agent-subsystem's controller and CRDs are not installed by this chart on the internal cluster. They are deployed from [re-cinq/ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem) by the same Argo CD, into the namespace `ai-agents`. All floor needs is that name: `clusterAgent.agentsNamespace: ai-agents` and `subsystem.enabled: false` in the internal values. The cluster agent creates its Agents in `ai-agents`, and the chart renders the Role, the `agent-secrets` Secret and the agent network policy there. The vendored copy under `deploy/agent-subsystem/` is for minikube and for a cluster that runs nothing else.

### The push-deploy workflow, left over

`build.yml` and `publish.yml` still call `deploy.yml`, which runs `helm upgrade --install` into the cluster the repository variables `GCP_PROJECT_ID` and `GKE_CLUSTER_NAME` name. Those point at `n8n-cluster`, the release that is scaled to zero. The job is the leftover of the push-based setup and is to be removed with that cluster (re-cinq/infrastructure, `docs/deploying.md`, "Moving an existing push-deployed repository"). It must not be pointed at `internal-cluster`, where Argo would undo it. The image and the chart are published all the same.

### What a workflow publishes

The image is always `ghcr.io/re-cinq/floor`. Every tag is one index of `linux/amd64` and `linux/arm64`, which a pull resolves to the node's own architecture. Nothing is emulated to build it, since the compile and the runtime dependencies are the same on both.

| what happens | the workflow | the image's tags |
|---|---|---|
| a commit to `main` that touches the code, the Dockerfile or the chart | `build.yml` | its short SHA, and `latest` |
| a tag `v1.2.3` is pushed | `publish.yml` | `1.2.3` and `1.2`; the chart `1.2.3` to `oci://ghcr.io/re-cinq/charts/floor`; the npm packages |
| `build.yml` run by hand on a branch | `build.yml` | the commit's short SHA |

`.github/workflows/ci.yml` gates pull requests: one test job a workspace so a red suite cannot mask the others, then typecheck, lint, `scripts/check-chart.sh`, and a Docker build and image check for each of `amd64` and `arm64`. Every job builds before it tests. Cross-package suites import a workspace through its `dist`, so a run without a build tests the last build and not the branch.

## Verified on a cluster

Installed into a scratch namespace on minikube, from an image built from this repo's Dockerfile, with Postgres outside the cluster. A run went through a real agent pod with the API, the cluster agent and the subsystem's controller all in-cluster, and the visit's resources were deleted afterwards. The cluster agent ran under the chart's Role, which `kubectl auth can-i --list` shows as exactly `create` and `delete` on the three agent resources, and `get` and `update` on the secret `agent-secrets`.

What that found, and what the chart does about it:

- **Ready means "can serve", not "runs the loop".** `/readyz` used to be the floor's lease, which one instance holds. A second replica was never ready, so `helm install --wait` waited on it until it timed out, and a rolling update would have waited for a new pod that cannot be ready while the old one lives. Now every replica that reaches Postgres is ready, and the loop runs on whichever holds the lease.
- **Ready does not queue behind requests.** `/readyz` asked the request pool for a connection, and a `/metrics` scrape or a few slow run reads held all ten for longer than the kubelet's default one-second probe timeout. Both replicas then dropped out of the Service together, about forty times a day. The check now has a connection of its own and gives up after two seconds, and the chart sets both api probes to wait three, so the floor answers 503 itself before the kubelet gives up on it.
- **CRDs are Helm's to create, never to change.** `--skip-crds` leaves the cluster alone entirely.
- **A password may hold any character.** The connection string is built with the user and password percent-encoded.
