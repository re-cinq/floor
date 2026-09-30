# @floor/assembly-lines

The walk kernel: a pure replay over persisted visits (`getNextTransition`),
plus content-hashing for versioned definitions (`definitionHash`). See
[docs/assembly_run_storage.md](../../docs/assembly_run_storage.md), "Routing:
the kernel decides, events carry".

## Where this fits

The bottom of the stack, and the only part with no I/O at all: given a line and the visits a run
has so far, it says which edge is taken next. [`packages/store`](../store/README.md) is its only
caller — it asks once, inside the transaction that writes a report. It depends on nothing of ours,
which is why its tests are plain values and no database.

See [the map](../../README.md) for how a decision here becomes work somewhere else.

## Ported from lore

Source: `libs/assembly-lines/src/{transition,definition-hash}.ts` in the
lore monorepo, Apache 2.0, same organisation. `transition.ts` ports with two
adaptations, documented in its file header:

- a node's outcomes are whatever its station declares, not a fixed
  three-value union — `NodeVisit.outcome` widens from `StageOutcome` to `string`
- there is no failure classification, so every failure spends its edge's
  iteration budget; lore's out-of-credit gate becomes a queue-side
  `not_before` push instead (see the storage doc, "Provider out of credit")

`definitionHash` ports with one change: it takes a plain body instead of a
typed `AssemblyLine`, since this floor content-hashes three kinds of
definition (line, station, agent definition), not one.

## Not ported

The line loader and schema (`loader.ts`, `assembly-line-schema.ts`,
`assembly-line-validate.ts`) are not in this package. They belong to the
line-authoring layer described in
[docs/entities/assembly-line.md](../../docs/entities/assembly-line.md) —
start events, `bind`, the `subject` argument mark — which has no
counterpart in lore's schema. That doc's "Validation at creation" is built
in full except for the `git`-write review-gate check (a node whose station
needs `git` `access: write` must have a review or human node on every path
in, unless it is the first writer), which waits on a separate decision.

## Tests

68 cases across `transition.test.ts` and `definition-hash.test.ts`, ported
and trimmed from lore's test files; each file's header says what was
dropped and why (mainly the failure-classification cases, which have no
counterpart here, and the builtin-line walk, which needs the loader).
