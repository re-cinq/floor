# Tutorial: from nothing to your first assembly run

Install a floor, give it a cluster to run agents in, import an **assembly line**, and start an **assembly run** of it. There are five steps, and each ends with something you can check before going on.

An assembly line is the definition you import. An assembly run is one execution of it. You import an assembly line once and start many assembly runs of it.

If you are deciding what the assembly line should do, start with [Define your first assembly line](https://re-cinq.github.io/floor/tutorials/define-a-launch-approval/).

If you only want to see a run happen on your laptop, use the dev loop instead: `npm start`, then `scripts/walk-agent.sh`. See [dev_loop.md](dev_loop.md). This page is about a real install, on a cluster of your own. re:cinq's own floor is deployed by Argo CD and not by these commands, see [the chart's README](../deploy/chart/README.md#how-recinq-deploys-it).

## What you need first

| | |
|---|---|
| A Kubernetes cluster, `helm` 3.8 or later | Agents run as pods in it. minikube is fine. |
| A Postgres | Outside the cluster as far as this chart cares. It never deploys one. |
| A model credential | An Anthropic or Gemini key, or a Claude OAuth token. Without one, agents start and fail. |
| Node.js | For the pipeline CLI, an npm package. |

Floor is one image and one chart, published together with every [release](https://github.com/re-cinq/floor/releases). The chart is at `oci://ghcr.io/re-cinq/charts/floor` and the image at `ghcr.io/re-cinq/floor`, under the same version. The api and the cluster agent are the same build, chosen at deploy time, so they never run two versions at once. Pick a release. `<release>` below is its version without the `v`, such as `0.2.0`.

## 1. Install floor

Create two secrets first. Floor reads them and never creates them.

```bash
kubectl create secret generic floor-api \
  --from-literal=serviceToken="$(openssl rand -hex 32)" \
  --from-literal=visitTokenSecret="$(openssl rand -hex 32)"

kubectl create secret generic floor-postgres \
  --from-literal=connectionString='postgres://user:password@host:5432/floor'
```

`serviceToken` is how every client authenticates, whether it is lore, a worker or you. `visitTokenSecret` signs the short-lived token one visit gets, which is how a pod proves it is that visit and no other. That token opens the visit's own brief, records, files and report. It cannot read a definition, start a run or claim work.

Then install:

```bash
helm install floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --set api.baseUrl=https://floor.example.com \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres \
  --set postgres.secretKey=connectionString \
  --set subsystem.enabled=true
```

`api.baseUrl` is the address pods reach floor at, so it must work from inside the cluster. `subsystem.enabled=true` also installs the [ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem)'s controller, which is what runs an agent pod. Leave it off only if another install on the cluster already runs it.

The chart runs the image of its own version, so no tag is named. A migration Job runs on install and on every upgrade, and it creates the tables. The chart refuses an install missing a required value, such as `api.existingSecret`, before anything is applied.

Check it:

```bash
curl -s https://floor.example.com/healthz
curl -s https://floor.example.com/version
```

Two api replicas run by default and both serve. Only one runs the event loop, held on a Postgres advisory lease. `/version` tells you whether the replica that answered is the one. A replica without the lease is not a fault.

## 2. Register a cluster

A cluster joins a floor by running a cluster agent. The agent registers under its `clusterAgent.clusterId` (`PUT /clusters/{id}`, on start and every minute after) and then claims work by tag. Floor never connects to a cluster. The cluster connects to floor.

The install above already did it. `clusterAgent.enabled` defaults true, and the agent registers as `default`. It offers the tag `kind:agent`, which every agent dispatch carries, and its own tag `cluster:default`. With one cluster there is nothing more to do.

A second cluster is a second install, with the api turned off, pointed at the first floor and offering a tag of its own:

```bash
helm install floor-acme oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --set api.enabled=false \
  --set clusterAgent.floorUrl=https://floor.example.com \
  --set clusterAgent.clusterId=acme \
  --set api.existingSecret=floor-api \
  --set subsystem.enabled=true
```

`api.existingSecret` is still required with the api off, because the cluster agent authenticates with the same `serviceToken`. The agent offers `cluster:acme` itself, beside `clusterAgent.tags`.

Now work reaches a chosen cluster by what its agent definition asks for:

```yaml
settings:
  tags: [cluster:acme]     # only a cluster agent offering this may run it
```

A claimer must offer every tag on the dispatch. An agent definition with no tags is claimable by any cluster, and one tagged `cluster:acme` is claimable only by the agent above. That is the whole routing model for visits. Agent definitions are the one thing a floor sends to every registered cluster, see [assembly_run_storage.md](assembly_run_storage.md#distribution-and-presence), "Distribution and presence".

Check it: the cluster agent logs that it is claiming. Nothing is dispatched yet, so an idle agent is the correct state.

## 3. Give the agents a model credential

The chart creates an empty Secret called `agent-secrets`, and the cluster agent writes each visit's token into it. The model credential is yours to put there:

```bash
kubectl patch secret agent-secrets --type merge \
  -p '{"stringData":{"ANTHROPIC_API_KEY":"sk-ant-..."}}'
```

The Secret is created only if it does not already exist, and it is never overwritten on upgrade, so what you put here survives.

Which key an agent reads depends on the model family. Override it with `clusterAgent.modelSecretKeys` (for example `claude=CLAUDE_CODE_OAUTH_TOKEN,gemini=GEMINI_API_KEY`) when your key lives under a different name. On minikube, `npm run minikube-claude-auth` does this for you.

## 4. Import an assembly line

An assembly line, its stations, its agent definitions and their prompts travel together as one file. Put it in with `floor-pipeline`:

```bash
npm install -g @re-cinq/floor-pipeline

export FLOOR_SERVICE_TOKEN=<the serviceToken from step 1>
floor-pipeline import my-line.yaml --floor https://floor.example.com
```

Importing the same file twice changes nothing. A version is its content, so an unchanged file is not a new version. `migrate <dir>` applies a folder of files in name order, each once.

To have floor seeded at every deploy, put the files in a ConfigMap and name it:

```bash
kubectl create configmap floor-pipelines --from-file=pipelines/
helm upgrade floor oci://ghcr.io/re-cinq/charts/floor --version <release> \
  --reuse-values --set pipelines.existingConfigMap=floor-pipelines
```

A job then runs `migrate` over them after each install and upgrade, once the floor answers ready. A file that ran is not run again, and one changed since fails the job. A change is a new file.

To bring an assembly line over from lore instead of writing one, convert it. The converter is a developer's tool and is not published. It runs from a checkout of this repository, after `npm install` and `npm run build`.

```bash
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review \
  --put https://floor.example.com
```

The converter also tells you what floor would refuse before you put it, and what it could not read from lore. Read its notes. A quiet run does not mean everything converted.

Check it:

```bash
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
  https://floor.example.com/assembly-lines
```

## 5. Start an assembly run and watch it

There are two ways to start an assembly run. By hand:

```bash
curl -s -X POST -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
  -H 'content-type: application/json' \
  https://floor.example.com/assembly-lines/code-review/start \
  -d '{
    "repo": "github.com/re-cinq/lore",
    "startItems": {
      "repo":   { "kind": "git",   "ref": "github.com/re-cinq/lore@main", "by": "start" },
      "pr_url": { "kind": "value", "ref": "https://github.com/re-cinq/lore/pull/412", "by": "start" }
    }
  }'
```

`startItems` seeds the run's bag. Each item is `{ kind, ref, by }`, where `by` is whoever put it there. You get `201` with the new run, or `200` and `joined: true` if a run is already open on the same subject. Starting twice for one pull request joins the open run and does not duplicate it.

Or by event, which is how it happens in practice. An assembly line declaring `start.on` starts a run whenever anything posts a matching event to `POST /events`, such as lore's webhook feeder or a schedule tick.

Watch it:

```bash
# the run, with its bag
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
  https://floor.example.com/assembly-runs/<run id>

# its visits, one a node
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
  "https://floor.example.com/station-runs?run=<run id>"

# what an agent actually said and what it cost
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
  "https://floor.example.com/station-runs/<visit id>/records?kind=turn"
```

A visit moves from opened, to claimed by a worker, to reported. When the walk reaches the exit the run settles as `success`. When it reaches the assembly line's `fail` node, if it names one, the run settles as `failed`. `GET /assembly-runs/<id>` shows the outcome.

## When it doesn't work

| what you see | where to look |
|---|---|
| Nothing happens at all | Is the loop running? `GET /version` on each replica says which holds the lease. |
| A dispatch sits unclaimed | Tags. The claimer must offer every tag on the dispatch. Compare the agent definition's `settings.tags` against `clusterAgent.tags`. An unclaimed dispatch fails at 30 minutes. |
| A visit failed with `timeout` | It passed its deadline, which is `now + queue wait + the agent definition's timeout`, set when the visit opened. |
| An agent pod starts and dies | The model credential in `agent-secrets`, under the key that family reads. |
| A visit cannot write to a repository | Floor mints no credentials. It asks the provider at `FLOOR_GIT_CREDENTIAL_URL`, presenting `FLOOR_GIT_CREDENTIAL_TOKEN`, which the floor requires whenever the URL is set. With none configured it answers 501 and refuses the brief. See [decisions.md](decisions.md), "GitHub". |
| An event keeps retrying | The queue backs off to ten minutes and dead-letters after eight attempts. `GET /events` is the feed. |

Nothing in a run is stored as state. Its status, its bag, its current node and its cost are all derived by replaying its visits. If something looks wrong, read the visits first.

## Next

- [using.md](using.md): the CLI, the client, writing a service station, and the HTTP API
- [Install on a cluster](https://re-cinq.github.io/floor/reference/install/): upgrading, a second cluster, uninstalling
- [assembly_run_storage.md](assembly_run_storage.md): the model underneath all of the above
- [api_sketch.md](api_sketch.md): every endpoint
- [The pipeline file](https://re-cinq.github.io/floor/specs/pipeline-file/): how to write an assembly line of your own
- [dev_loop.md](dev_loop.md): the same things, on minikube, with hot reload
