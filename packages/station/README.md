# @re-cinq/floor-station

The service station SDK of [floor](https://github.com/re-cinq/floor). A service station is one function; this is everything around it.

```
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

Run it with `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` set. It needs a way out to the floor and nothing else: the floor never calls it.

## Where this fits

This is not one of floor's processes: it is what somebody else's process imports to *become* a
station. A service worker built with it runs wherever its author likes — another repository, another
cluster — and needs only a way out to the floor's HTTP API and a service token. Floor never calls
it; it claims its own work from the queue by the tag `station:<name>`.

Every provider-shaped job is one of these. lore's GitHub workers are written with this, which is
why the picture in [the map](https://github.com/re-cinq/floor/blob/main/README.md) has nothing GitHub-shaped inside floor.

## What it does for the function

| | |
|---|---|
| claims | the dispatches tagged `station:<name>`, and only those |
| the brief | `visitId`, `runId`, `lineId`, `nodeId`, `iteration`, and each need by name: a value as its text, a file as an address, a repo as `url@ref`. Key what must survive a retried visit on `runId`, and add `nodeId` when the state belongs to one node of the line rather than the whole run |
| `tools.read(need)` | the bytes of a file need |
| `tools.produce(name, bytes)` | stores a file with the floor and names it in the report |
| `tools.modelCall(call)` | records a model call, so the floor's costs count it |
| `tools.signal` | aborted when the visit's deadline passes |
| the report | what the function returns, posted once however often it is sent |
| a function that throws | the visit is `failed`, with what it threw as the error |
| the floor out of reach | the dispatch is handed back to the queue, to be tried again |

When a visit ends the floor posts `station_run.abort` to the worker that claimed it. A service holds nothing between visits, so the SDK acks it and does nothing else.

## What is here

- `station.ts` — `defineStation`, and the loop: claim, work, ack, rest only after finding nothing.
- `visit.ts` — one visit worked, from brief to report.
- `floor.ts` — the floor over HTTP. The service token claims and acks; everything about one visit goes under that visit's own token, which came with its brief.

## Testing

`station.test.ts` here covers what needs no floor. The rest is tested against a real one, in `apps/api/src/station-sdk.test.ts`: a real HTTP server on a real port, real Postgres, and the floor's own loop.
