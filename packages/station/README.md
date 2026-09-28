# @floor/station

The service station SDK. A service station is one function; this is everything around it.

```ts
import { defineStation } from "@floor/station";

defineStation("close-issue", async (brief, tools) => {
  const spec = await tools.read("spec");
  await issues.close(brief.needs.issue, spec.toString());
  await tools.produce("summary", `closed ${brief.needs.issue}`);

  return { outcome: "success", produced: { closed_by: "close-issue" } };
});
```

Run it with `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` set. It needs a way out to the floor and nothing else: the floor never calls it.

## What it does for the function

| | |
|---|---|
| claims | the dispatches tagged `station:<name>`, and only those |
| the brief | each need by name: a value as its text, a file as an address, a repo as `url@ref` |
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
