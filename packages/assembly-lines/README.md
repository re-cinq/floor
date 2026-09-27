# @floor/assembly-lines

The walk kernel: a pure replay over persisted visits (`getNextTransition`),
plus content-hashing for versioned definitions (`definitionHash`). See
[docs/assembly_run_storage.md](../../docs/assembly_run_storage.md), "Routing:
the kernel decides, events carry".

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
start events, `bind`, the `subject` argument mark, needs-coverage validation
— which has no counterpart in lore's schema and is not yet built.

## Tests

68 cases across `transition.test.ts` and `definition-hash.test.ts`, ported
and trimmed from lore's test files; each file's header says what was
dropped and why (mainly the failure-classification cases, which have no
counterpart here, and the builtin-line walk, which needs the loader).
