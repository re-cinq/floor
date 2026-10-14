# Use floor

Put an assembly line into a running floor, start an assembly run of it, watch it, and write the
pieces that do the work. Everything here is done from outside the floor, with the service token,
through the published npm packages or plain HTTP. This page assumes a floor is
[installed](install.md).

Two words carry the model. An **assembly line** is a definition you import once. An **assembly
run** is one execution of it, and you start many.

| you want to | use |
|---|---|
| move assembly lines between files and a floor | the CLI, `@re-cinq/floor-pipeline` |
| start, list and watch runs from a program | the client, `@re-cinq/floor-client` |
| do a step's work in your own service | the station SDK, `@re-cinq/floor-station` |
| do any of it from a shell or another language | the HTTP API, [api_sketch.md](api_sketch.md) |

All four are published with every release under one version. Install the version of your floor.

## Authenticate

Every call carries the `serviceToken` you created at install, as a bearer token. The packages read
it from the environment:

```bash
export FLOOR_SERVICE_TOKEN=<serviceToken>
```

A human acts through the service token too: human sessions are not built yet.

## Import an assembly line

An assembly line, its stations, its agent definitions and their prompts travel as one YAML file.
How to write one is [entities/assembly-line.md](entities/assembly-line.md). Put it in with the CLI:

```bash
npm install -g @re-cinq/floor-pipeline

floor-pipeline import my-line.yaml --floor https://floor.example.com
```

| command | what it does |
|---|---|
| `import <file>...` | Puts each file to the floor. The same file twice changes nothing: a version is its content. |
| `export <line>` | Writes the line's latest version, and everything it names, as one file. |
| `export --all --dir <dir>` | One file a line, named after it: a backup. |
| `migrate <dir>` | The folder's files in the order of their names, each once. The floor remembers which ran. |
| `--wait-ready <seconds>` | Waits for the floor's `/readyz` first. For a job that starts with the floor. |

Check it:

```bash
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" https://floor.example.com/assembly-lines
```

To have lines seeded at every deploy instead, keep them in a ConfigMap and name it in the chart's
`pipelines.existingConfigMap`. A Job then runs `migrate` over them after each install and upgrade.
A file that ran is not run again, and a file changed after it ran fails the Job: a change is a new
file.

## Start an assembly run

By hand, over HTTP:

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

| response | meaning |
|---|---|
| `201` with the run | A new run started. |
| `200` with `joined: true` | A run is already open on the same subject. Starting twice joins; it never duplicates. |
| `400` with every error | The start items do not match what the line asks for. |

`startItems` seeds the run's bag. Each item is `{ kind, ref, by }`; `by` is whoever put it there.

Or from a program, with the client:

```bash
npm install @re-cinq/floor-client
```

```ts
import { createFloorClient, serviceToken } from "@re-cinq/floor-client";

const floor = createFloorClient({
  url: "https://floor.example.com",
  token: serviceToken(process.env.FLOOR_SERVICE_TOKEN!),
});

const { run } = await floor.lines.start("code-review", {
  repo: "github.com/re-cinq/lore",
  startItems: { pr_url: { kind: "value", ref: "https://github.com/re-cinq/lore/pull/412", by: "me" } },
});
```

Or by event, which is how runs start in practice: a line declaring `start.on` starts a run whenever
a matching event reaches `POST /events`. lore's webhook feeder and the floor's own schedules post
them.

## Watch a run

```ts
for await (const frame of floor.runs.watch(run.id)) {
  if (frame.type === "run_settled") break;
}
```

The watch is a WebSocket that replays from a cursor and reconnects without losing a frame. Over
plain HTTP, poll instead:

```bash
# the run, with its bag, status and cost
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" https://floor.example.com/assembly-runs/<run id>

# its visits, one per node reached
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" "https://floor.example.com/station-runs?run=<run id>"

# what an agent said at one visit, and what it cost
curl -s -H "Authorization: Bearer $FLOOR_SERVICE_TOKEN" "https://floor.example.com/station-runs/<visit id>/records?kind=turn"
```

A visit goes from opened, to claimed by a worker, to reported. When the walk reaches the line's
exit the run settles as `success`; reaching its `fail` node settles it as `failed`. Nothing about a
run is stored as state. Its status, bag and cost are replayed from its visits, so when something
looks wrong, the visits are the truth.

## Write a service station

A step that is not an agent and not a person is a service station: one function, running in your
own process, anywhere that reaches the floor. The floor never calls it. It claims its own work from
the queue by the tag `station:<name>`.

```bash
npm install @re-cinq/floor-station
```

```ts
import { defineStation } from "@re-cinq/floor-station";

defineStation("close-issue", async (brief, tools) => {
  const spec = await tools.read("spec");
  await issues.close(brief.needs.issue, spec.toString());
  await tools.produce("summary", `closed ${brief.needs.issue}`);

  return { outcome: "success", produced: { closed_by: "close-issue" } };
});
```

Run it with `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` set. The brief is what the visit needs, the
tools read needs and write produces, and the report settles the visit. Everything an agent step can
do, a service station can. The full contract is [packages/station](../packages/station/README.md).

## Everything else is the HTTP API

Every route a floor serves is listed in [api_sketch.md](api_sketch.md), with its body. The rules
that hold across all of them:

| rule | what it means for you |
|---|---|
| Errors are RFC 9457 problem details | `application/problem+json`, with `detail`. A refused write is `409` and names what holds it. |
| Lists page by cursor | `limit` up to 200 and an opaque `cursor` to hand back unchanged. |
| Creates are idempotent by natural key | A run by its subject, a definition by its content, an event by its `dedupeKey`. Repeating returns what exists. |
| Bodies are `camelCase` | `runId`, `startItems`, `dedupeKey`. The YAML files are `snake_case`; the CLI converts. |
| The floor never calls out | Workers pull. Nothing you run needs to be reachable from the floor. |

## When it doesn't work

| what you see | where to look |
|---|---|
| Nothing happens at all | `GET /version` on each api replica says which holds the loop's lease. |
| A dispatch sits unclaimed | Tags. The claimer must offer every tag on the dispatch; compare the agent definition's `settings.tags` with the chart's `clusterAgent.tags`. An unclaimed dispatch fails at 30 minutes. |
| A visit failed with `timeout` | It passed its deadline: queue wait plus the agent definition's timeout, set when the visit opened. |
| An agent pod starts and dies | The model credential in `agent-secrets`, under the key its model family reads. |
| A visit cannot write to a repository | Floor mints no credentials. It asks the provider the chart's `api.gitCredentialUrl` names; with none, it answers `501` and refuses the brief. |
| An event keeps retrying | The queue backs off to ten minutes and dead-letters after eight attempts. `GET /events` is the feed. |
