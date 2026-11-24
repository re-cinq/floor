# @re-cinq/floor-assembly-lines

The rules of a floor's assembly line, as pure functions with no I/O and no database. It holds four things:

- the walk kernel, which says which edge a run takes next and when it ends
- the checks an assembly line must pass before a floor stores it
- the parameters a prompt is given
- the answers a tool that draws a line needs: which events start and leave each node, and what each `{placeholder}` of a prompt is filled with

The floor's store, its cluster agent and the tools that read a line before it reaches a floor all use these, so they cannot disagree.

```
npm install @re-cinq/floor-assembly-lines
```

```ts
import { getNextTransition, validateLine } from "@re-cinq/floor-assembly-lines";

const line = {
  entry: "write",
  exit: "done",
  args: {},
  nodes: [{ id: "write", station: "writer" }, { id: "done" }],
  edges: [{ from: "write", to: "done", on: "success" }],
};

// Every problem a line has, or an empty list.
validateLine(line, { stations: new Set(["writer"]) });

// What the walk does next, from the visits so far.
getNextTransition(
  { name: "demo", entry: "write", exit: "done", edges: line.edges },
  [{ nodeId: "write", iteration: 1, outcome: "success" }],
); // { kind: "finish" }
```

## What it exports

| export | what it does |
|---|---|
| `getNextTransition`, `selectEdge`, `endsRun`, `isTerminalNode`, `visitsSinceHandRun` | the walk kernel: replay the visits of a run and say what happens next |
| `definitionHash` | the content hash of a versioned definition |
| `readAgentVerdict` | reads an agent's verdict from what it reported |
| `validateLine`, `KnownDefinitions` | every problem a line body has: names, edges, reachability, arguments, outcomes, cycles, needs, fan-outs |
| `gitArgNames`, `nodeStartedBy`, `requireNode`, `startEventName` | small readers of a line: its git arguments, and the event that starts a node |
| `promptParameters`, `runParameters`, `WORKSPACE` | the values a prompt's `{placeholders}` are filled with |
| `declaredParameters`, `needPathOf`, `RUN_PARAMETER_NAMES`, `BROKER_PARAMETER_NAMES` | the names those values have, worked out from a station's declaration instead of a brief. `floor-pipeline lint` and the tools that draw an assembly line share `declaredParameters`, so they name a prompt's parameters the same way |
| `nodeEvents`, `CollectionLine`, `DISPATCH_EVENT`, `REPORTED_EVENT`, `RUN_SETTLED_EVENT` | the events that start a node, answer it and leave it |
| `needCoverage`, `coverageContextOf`, `needMissesOf`, `EXEMPT_NEEDS` | how one need at one node is covered: seeded, filled on every path, sometimes empty (with one path), never filled, and the rest |
| `placeholderPattern` | the `{name}` rule as a fresh `RegExp`, also at the browser-safe subpath `@re-cinq/floor-assembly-lines/placeholder-pattern`, which loads no Node module |
| `promptPlaceholders`, `placeholderNames` | each `{name}` a prompt reads, what supplies it, whether it is filled on every path into the node, and the needs it never mentions |
| `Refusal`, `enforce` | the error a request that can never be accepted throws, and the check that throws it |
| `FAN_STATIONS`, `fanLine` | the stations and the line of a small fan-out, for tests |

### Events of a node

`nodeEvents(line, node, lines, bodies)` says what starts a node, what answers it and what it raises. `lines` is every line of the collection, so a node that ends a run can name the lines that start on `internal.run.settled`.

```ts
const line = {
  entry: "write", exit: "done", args: {},
  nodes: [{ id: "write", station: "writer" }, { id: "done" }],
  edges: [{ from: "write", to: "done", on: "success" }],
};
const bodies = new Map([["writer", { kind: "agent", outcomes: ["success", "failed"], needs: [], produces: [] }]]);

nodeEvents(line, line.nodes[0], [], bodies);
// {
//   startedBy: [{ event: "node.write.start", origin: "line-start" }],
//   answeredBy: [],
//   raises: [
//     { kind: "event", event: "station_run.dispatch" },
//     { kind: "event", event: "station_run.reported" },
//     { kind: "outcome", outcome: "success", leadsTo: { on: "success", node: "done", event: "node.done.start" } },
//     { kind: "outcome", outcome: "failed", leadsTo: null },
//   ],
// }
```

`origin` is `walk` when an edge leads to the node, `outside` when the node names its own `start`, `line-start` when the line's own start raises it, and `none` when nothing does. `leadsTo` is the edge `selectEdge` takes, so an exact outcome wins over `always`, and `null` when no edge takes that outcome.

### Placeholders of a prompt

`promptPlaceholders({ prompt, line, node, station, bodies })` gives one row per distinct `{name}` and the needs the prompt never mentions.

```ts
promptPlaceholders({ prompt: "Fix {ticket} in {repo_path}. {typo}", line, node, station, bodies });
// {
//   placeholders: [
//     { name: "ticket", source: "value-need", state: "sometimes-empty", filledBy: ["open"], path: ["start", "skip", "join"] },
//     { name: "repo_path", source: "need-path", state: "seeded", filledBy: [], path: [] },
//     { name: "typo", source: "none", state: "unsupplied", filledBy: [], path: [] },
//   ],
//   unused: [],
// }
```

`source` is `value-need`, `need-path` (a file or git need, read as `{name_path}`), `produce-path`, `floor` or `none`. `state` is `unsupplied` when nothing supplies the name, otherwise how the need is covered. `path` is one walk from a start point to the node that passes no producer, for `sometimes-empty`.

A name is letters, digits, `_`, `.` and `-` and starts with a letter or `_`, the agent subsystem's own rule with the first character narrowed, so `a{3}` and a JSON object are not placeholders.

The shapes of a line, a station and a brief come from [`@re-cinq/floor-contracts`](https://github.com/re-cinq/floor/tree/main/packages/contracts).

## Where this fits

This is the bottom of the stack, and the only part with no I/O at all. Given an assembly line and the visits a run has so far, it says which edge is taken next. [`packages/store`](../store/README.md) asks it once, inside the transaction that writes a report, and validates a line with it before storing one. The cluster agent asks it for a prompt's parameters. It depends on nothing of ours but the shapes in `@re-cinq/floor-contracts`, which is why its tests are plain values and no database.

A walk ends in one of two places. At the line's `exit` it is `finish`. At its `fail` node, when it names one, it is `halt` with outcome `failed` and a reason naming the node whose edge led there. Neither terminal is ever launched. `isTerminalNode` is that rule for anyone else who needs it, and line validation asks it which nodes owe no outgoing edge.

A transition is one of four: `launch` a node, `await` an open visit, `finish` at the exit, or `halt`. `halt` is every other way a walk ends: a spent budget (`iteration_max`, whether the edge's `iterationMax` or its `unattendedMax` ran out), an `error`, or the line's own fail node (`failed`). `halt` was called `fail` until a line could name a fail node, and the word now means only the node. `endsRun` says whether a transition is one of the last two.

See [the map](../../README.md) for how a decision here becomes work somewhere else.

## Ported from lore

Source: `libs/assembly-lines/src/{transition,definition-hash}.ts` in the lore monorepo, Apache 2.0, same organisation. `transition.ts` ports with two adaptations, documented in its file header.

- A node's outcomes are whatever its station declares, not a fixed three-value union. `NodeVisit.outcome` widens from `StageOutcome` to `string`.
- There is no failure classification, so every failure spends its edge's iteration budget. lore's out-of-credit gate becomes a queue-side `not_before` push (see the storage doc, "Provider out of credit").

`definitionHash` ports with one change. It takes a plain body where lore took a typed `AssemblyLine`, since this floor content-hashes three kinds of definition (line, station, agent definition), not one.

## Not ported

The line loader and schema (`loader.ts`, `assembly-line-schema.ts`, `assembly-line-validate.ts`) are not in this package. They belong to the line-authoring layer described in [the pipeline file specification](https://re-cinq.github.io/floor/specs/pipeline-file/) (start events, `bind`, the `subject` argument mark), which has no counterpart in lore's schema.

Its rules of a line are built in full except for one.

> **Not built yet.** The `git`-write review-gate check, which waits on a separate decision. The check is that a node whose station needs `git` `access: write` must have a review or human node on every path in, unless it is the first writer.

## Tests

The walk kernel's cases are in `transition*.test.ts` and `definition-hash.test.ts`, ported and trimmed from lore's test files. Each file's header says what was dropped and why, mainly the failure-classification cases, which have no counterpart here, and the builtin-line walk, which needs the loader.

The line checks and the prompt parameters keep their tests beside them in `line-*.test.ts` and `prompt-parameters.test.ts`. The events, the need coverage and the placeholders are in `node-events.test.ts`, `need-coverage.test.ts` and `prompt-placeholders.test.ts`.
