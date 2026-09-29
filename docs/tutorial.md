# Tutorial: from nothing to your first assembly run

Install a floor, give it a cluster to run agents in, import an **assembly line**, and start an
**assembly run** of it. Five steps. Each one ends with something you can check before going on.

Those two words are different things throughout: an assembly line is the definition you import, and
an assembly run is one execution of it. You import an assembly line once and start many assembly
runs of it.

If you only want to see a run happen on your laptop, skip all of this and use the dev loop:
`npm start`, then `scripts/walk-agent.sh`. See [dev_loop.md](dev_loop.md). This page is about a real
install.

## What you need first

| | |
|---|---|
| A Kubernetes cluster | Agents run as pods in it. minikube is fine. |
| A Postgres | **Outside** the cluster as far as this chart cares — it never deploys one. |
| An image | Built from this repo's `Dockerfile`, pushed somewhere the cluster can pull. |
| A model credential | An Anthropic or Gemini key, or a Claude OAuth token. Without one, agents start and fail. |

Floor is one image and one chart. The api and the cluster agent are the same build, chosen at
deploy time — never two versions at once.

## 1. Install floor

Two secrets first. Floor reads them, never creates them.

```bash
kubectl create secret generic floor-api \
  --from-literal=serviceToken="$(openssl rand -hex 32)" \
  --from-literal=visitTokenSecret="$(openssl rand -hex 32)"

kubectl create secret generic floor-postgres \
  --from-literal=connectionString='postgres://user:password@host:5432/floor'
```

`serviceToken` is how every client — lore, a worker, you — authenticates. `visitTokenSecret` signs
the short-lived token one visit gets, which is how a pod proves it is that visit and no other.
That token opens the visit's own brief, records, files and report, and nothing else: it cannot
read a definition, start a run or claim work.

Then install:

```bash
helm install floor deploy/chart \
  --set version=<image tag> \
  --set image.repository=ghcr.io/re-cinq/floor \
  --set api.baseUrl=https://floor.example.com \
  --set api.existingSecret=floor-api \
  --set postgres.existingSecret=floor-postgres \
  --set postgres.secretKey=connectionString \
  --set subsystem.enabled=true
```

`api.baseUrl` is the address **pods** reach floor at, so it must work from inside the cluster.
`subsystem.enabled=true` also installs the
[ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem)'s controller — the thing that
actually runs an agent pod. Leave it off only if another install on the cluster already runs it.

A migration Job runs on install and on every upgrade; it creates the six tables. The chart
refuses an install with no `version` or no `api.existingSecret`, before anything is applied.

**Check it:**

```bash
curl -s https://floor.example.com/healthz
curl -s https://floor.example.com/version
```

Two api replicas run by default and **both serve**. Only one runs the event loop, held on a
Postgres advisory lease — `/version` tells you whether the replica that answered is the one. That
is expected, not a fault.

## 2. Register a cluster

There is no registration endpoint. **A cluster joins a floor by running a cluster agent that claims
work from it**, and the claim is by tag. Floor never connects to a cluster; the cluster connects to
floor.

The install above already did it: `clusterAgent.enabled` defaults true, and the agent offers the
tag `kind:agent`, which every agent dispatch carries. One cluster, nothing more to do.

**A second cluster** is a second install, api turned off, pointed at the first floor and offering a
tag of its own:

```bash
helm install floor-acme deploy/chart \
  --set version=<image tag> \
  --set api.enabled=false \
  --set clusterAgent.floorUrl=https://floor.example.com \
  --set clusterAgent.tags="kind:agent,cluster:acme" \
  --set api.existingSecret=floor-api \
  --set subsystem.enabled=true
```

`api.existingSecret` is still required with the api off: the cluster agent authenticates with the
same `serviceToken`.

Now work reaches a chosen cluster by what its agent definition asks for:

```yaml
settings:
  tags: [cluster:acme]     # only a cluster agent offering this may run it
```

**A claimer must offer every tag on the dispatch.** An agent definition with no tags is claimable by
any cluster; one tagged `cluster:acme` is claimable only by the agent above. That is the whole
routing model — floor does not know what a cluster is, only what a tag is.

**Check it:** the cluster agent logs that it is claiming. Nothing is dispatched yet, so an idle
agent is the correct state.

## 3. Give the agents a model credential

The chart creates an empty Secret called `agent-secrets` and the cluster agent writes each visit's
token into it. The model credential is yours to put there:

```bash
kubectl patch secret agent-secrets --type merge \
  -p '{"stringData":{"ANTHROPIC_API_KEY":"sk-ant-..."}}'
```

The Secret is created only if it does not already exist, and never overwritten on upgrade, so what
you put here survives.

Which key an agent reads depends on the model family; override it with `clusterAgent.modelSecretKeys`
(for example `claude=CLAUDE_CODE_OAUTH_TOKEN,gemini=GEMINI_API_KEY`) when your key lives under a
different name. On minikube, `npm run minikube-claude-auth` does this for you.

## 4. Import an assembly line

An assembly line, its stations, its agent definitions and their prompts travel together as **one
file**. Put it in with `floor-pipeline`:

```bash
npm run build -w @floor/pipeline

export FLOOR_SERVICE_TOKEN=<the serviceToken from step 1>
node packages/pipeline/dist/cli.js import my-line.yaml --floor https://floor.example.com
```

Importing the same file twice changes nothing: a version *is* its content, so re-importing an
unchanged file is not a new version. A folder of them, applied in name order and each once, is
`migrate <dir>`.

To have floor seeded at every deploy, put the files in a ConfigMap and name it:

```bash
kubectl create configmap floor-pipelines --from-file=pipelines/
helm upgrade floor deploy/chart --reuse-values --set pipelines.existingConfigMap=floor-pipelines
```

A job then runs `migrate` over them after each install and upgrade, once the floor answers ready.
A file that ran is not run again, and one changed since fails the job: a change is a new file.

To bring an assembly line over from lore instead of writing one, convert it:

```bash
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review \
  --put https://floor.example.com
```

The converter also **tells you what floor would refuse** before you put it, and what it could not
read from lore — read its notes rather than assuming silence means success.

**Check it:**

```bash
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" \
  https://floor.example.com/assembly-lines
```

## 5. Start an assembly run and watch it

An assembly run is one execution of an assembly line, and there are two ways to start one. By hand:

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

`startItems` seeds the run's bag; each item is `{ kind, ref, by }`, where `by` is whoever put it
there. You get `201` with the new run, or `200` and `joined: true` if a run is already open on the
same subject — starting twice for one pull request joins rather than duplicates.

Or **by event**, which is how it happens in practice: an assembly line declaring `start.on` starts a
run whenever anything posts a matching event to `POST /events` — lore's webhook feeder, a schedule
tick.

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

A visit moves from opened, to claimed by a worker, to reported. When the walk reaches the exit the
run settles, and `GET /assembly-runs/<id>` shows its outcome.

## When it doesn't work

| what you see | where to look |
|---|---|
| Nothing happens at all | Is the loop running? `GET /version` on each replica says which holds the lease. |
| A dispatch sits unclaimed | Tags. The claimer must offer **every** tag on the dispatch; compare the agent definition's `settings.tags` against `clusterAgent.tags`. An unclaimed dispatch fails at 30 minutes. |
| A visit failed with `timeout` | It passed its deadline — `now + queue wait + the agent definition's timeout`, set when the visit opened. |
| An agent pod starts and dies | The model credential in `agent-secrets`, under the key that family reads. |
| A visit cannot write to a repository | Floor mints no credentials. It asks the provider at `FLOOR_GIT_CREDENTIAL_URL`, presenting `FLOOR_GIT_CREDENTIAL_TOKEN`, which the floor requires whenever the URL is set; with none configured it answers 501 and refuses the brief. See [decisions.md](decisions.md), "GitHub". |
| An event keeps retrying | The queue backs off to ten minutes and dead-letters after eight attempts. `GET /events` is the feed. |

Nothing in a run is stored as state: its status, its bag, its current node and its cost are all
derived by replaying its visits. If something looks wrong, the visits are the truth — read those
first.

## Next

- [assembly_run_storage.md](assembly_run_storage.md) — the model underneath all of the above
- [api_sketch.md](api_sketch.md) — every endpoint
- [entities/assembly-line.md](entities/assembly-line.md) — how to write a line of your own
- [dev_loop.md](dev_loop.md) — the same things, on minikube, with hot reload
