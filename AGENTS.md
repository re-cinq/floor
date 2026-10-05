# AGENTS.md — floor

Workflow engine for pipelines of AI agents. Vocabulary: `Factory ⊃ Floor ⊃ AssemblyLine ⊃ Station ⊃ Agent`.

## Context loading order

Read these before changing any code:

1. `README.md` — the model, invariants, and the map of packages
2. `docs/decisions.md` — every non-obvious choice and its reason
3. `docs/assembly_run_storage.md` — the storage model (visits are truth, events are how they change)
4. `docs/api_sketch.md` — HTTP endpoints and their contracts
5. The package's own `README.md` (each package has one)
6. `packages/contracts/src/` — the wire types shared by server, store, and every client

Core invariants (README §"Three invariants"):
- Floor holds no provider client and never calls out.
- No floor code runs inside an agent pod.
- Visits are the truth; events are how they change.

## Workflow commands

```sh
npm install                            # install all workspaces
npm run build                          # compile every package in dependency order
npm test                               # run all workspace test suites
npm run typecheck                      # tsc --noEmit across all workspaces
npm run lint                           # eslint .
npm run lint:fix                       # eslint . --fix

# Postgres (required by @floor/store and @floor/api test suites)
npm run db:up                          # start floor-postgres container on :5433
npm run db:migrate                     # apply migrations

npm start                              # dev loop (see docs/dev_loop.md)
```

Run a single workspace's tests:

```sh
npm run test -w @floor/assembly-lines
npm run test -w @floor/store
npm run test -w @floor/api
# etc.
```

The build must precede tests: cross-package suites import through `dist/`, not source.

## Repository structure

| path | what it is |
|---|---|
| `apps/api` | HTTP API and the single-leased loop; only process touching Postgres |
| `apps/cluster-agent` | Talks to one Kubernetes cluster; turns dispatches into agent pods |
| `packages/assembly-lines` | Walk kernel — pure edge selection, no I/O |
| `packages/contracts` | Wire types shared by server, store, and every client; no runtime deps |
| `packages/client` | Typed HTTP client and live WebSocket for external callers |
| `packages/station` | SDK for writing a service station |
| `packages/pipeline` | Import/export an entire pipeline as one YAML file |
| `packages/lore-converter` | Reads a lore checkout; writes definitions for this floor |
| `packages/store` | Postgres layer: six tables, events queue, definitions store |
| `deploy/chart` | Helm chart; one image, both apps, toggled by command override |

## Commit conventions

- Imperative mood, present tense: "Add …", "Fix …", "Remove …"
- Short subject line (≤72 characters)
- Body explains *why*, not *what*; reference the decision it implements when relevant
- No emoji, no issue numbers in the subject
- Examples from the log: `"Name the git credential provider at deploy, so a deploy does not drop the one a floor has"`, `"Validate a line's outcomes, cycles and needs at creation, not at run time"`

## PR requirements

- All CI jobs must pass: `test`, `typecheck`, `lint`, `chart`, `docker`
- One job per workspace runs in parallel — a red suite must not mask others
- Cross-package changes: rebuild before testing (`npm run build` first)
- No secrets in source, config, or rendered chart values
- PR description must include `## Why`, `## What Changed`, and `## Testing` sections
- Deployable changes go to `main`; a `vX.Y.Z` tag triggers publish + deploy

## Test environment

- Vitest v5 with `@vitest/coverage-v8`
- `@floor/store` and `@floor/api` require a real Postgres instance (`FOR UPDATE SKIP LOCKED` has no in-memory stand-in)
- CI starts `pgvector/pgvector:pg16` as a service on port 5433 (matching `npm run db:up` locally)
- Test suites create and migrate their own database (`floor_test`); override with `FLOOR_TEST_DATABASE_URL`
- Tests run with `fileParallelism: false` inside the api workspace (route tests share one Postgres and race on truncation)

## Compliance constraints

- `npm ci --ignore-scripts` in CI — dependency lifecycle scripts are a supply-chain execution vector; nothing in this tree needs them
- No provider client lives in this repository (no Kubernetes, no GitHub, no chat SDK)
- Agent pods are given a visit token scoped to one visit's files and repositories; the token stops at the visit's deadline
- NetworkPolicy restricts pod egress to DNS, port 443 outside private ranges, and the floor API
- Published packages are licensed Apache-2.0 (`@re-cinq/floor-contracts`, `@re-cinq/floor-client`, `@re-cinq/floor-station`, `@re-cinq/floor-pipeline`)
- npm is published via Trusted Publishing (OIDC); no npm token is stored in the repository
