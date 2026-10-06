# @re-cinq/floor-client

The floor over HTTP and its live socket, typed. Every route a floor serves, and a watch that replays a run from a cursor and comes back without losing a frame.

```ts
import { createFloorClient, serviceToken } from "@re-cinq/floor-client";

const floor = createFloorClient({ url: "https://floor.example.com", token: serviceToken(process.env.FLOOR_SERVICE_TOKEN!) });

const { run } = await floor.lines.start("code-review", {
  repo: "github.com/re-cinq/lore",
  startItems: { pr_url: { kind: "value", ref: "https://github.com/re-cinq/lore/pull/412", by: "me" } },
});

for await (const frame of floor.runs.watch(run.id)) {
  if (frame.type === "run_settled") break;
}
```

## Where this fits

The one way anything reaches a floor from outside it. [`apps/cluster-agent`](../../apps/cluster-agent/README.md), [`@re-cinq/floor-station`](../station/README.md), [`@re-cinq/floor-pipeline`](../pipeline/README.md) and the lore converter all talk to a floor through this, and so does lore. It links no part of the floor's own storage — only [`@re-cinq/floor-contracts`](../contracts/README.md), for the shapes — so a floor's database is not reachable through it even by accident.

See [the map](../../README.md).

## What it decides for you

**Two tokens, and neither fits where the other belongs.** `ServiceToken` and `VisitToken` are branded, so one cannot be passed for the other. `createVisitClient` goes further: it binds the visit id at construction and takes one in no method, so addressing *another* visit is not something a caller can express. The floor refuses that with a 403; this refuses it at the compiler. The same client has no `events.post` — it has `report()`, which fills in the event's name, its visit and its dedupe key, because none of those are the caller's to choose.

**A status that carries meaning is in the return type, not an exception.** Absence is `null`, an empty queue is `[]`, and where a refusal is a real decision it is a named union:

```ts
const outcome = await floor.stationRuns.brief(visitId);

if (outcome.kind === "reported") return ack(event);      // 409: already done, run nothing
if (outcome.kind === "absent") return deadLetter(event); // 404: asking again will never find it
```

That one matters: before this package, a station read both as `null` and could not tell them apart, while the cluster agent threw on both and retried a settled visit until the event died.

Everything else a floor refuses throws a `FloorProblem` carrying the RFC 9457 body — `status`, `title`, `detail`, and the per-field `errors` a 400 lists.

**A filter the floor would 400 on does not compile.** `runs.list`, `events.feed` and `costs.summary` each need at least one filter, and the types say so.

**No runtime validation.** The client casts, in one place. The rule, which the floor already followed and never wrote down: validate across a trust boundary you do not own — `apps/api` validates what a git credential provider answers, because that is somebody else's service — and annotate across one you do. The floor's own handlers are annotated with these same types, so drift is a compile error on the server rather than a throw in someone else's pod.

## The live socket

`runs.watch(runId, options)` is an async iterable. It replays the run's journal from `after`, emits `caught_up`, then follows it live.

**It comes back for you.** The protocol was built for it — every frame but `unsupported` carries the `seq` to return with — so a watch reopens from the last seq it handed out, and misses nothing. It does not come back from a refusal: a bad cursor, a missing token, no such run, or too many viewers. That last one is deliberate. Sixteen viewers is a capacity signal, and a client that retried it invisibly would turn pressure on a busy run into a hidden hammer loop.

There is no idle timeout here on purpose. A caught-up quiet run legitimately says nothing for minutes; the floor's own ping already finds a dead viewer, and a client-side timer would only reconnect healthy watches.

A run a start by hand reopened goes on past its `run_settled`: `run_reopened` follows it, and the watch ends only at the settling the journal ends on.

One caveat for a relay: `visit_opened` and `visit_reported` carry the whole visit, `agentSettings` included — the model, the prompt, the image. Filter those before they reach a browser.

`runs.watchFloor(options)` follows the whole floor instead of one run: `run_started` and `run_changed`, each with a run's id and nothing else. It has no cursor. The floor opens every connection with `resync`, which means "read your list again", so a watch that drops comes back with nothing to remember. It is refused without the service token and comes back from everything else.

## Testing against it

Both seams are injectable and neither needs a server: `fetchFn` for HTTP, `socketFn` for the live socket. With `backoffMs: () => 0`, the whole reconnect table is unit-testable in milliseconds — see `live.test.ts`.
