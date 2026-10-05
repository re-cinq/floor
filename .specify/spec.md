# System Specification — floor

## Overview

Floor is a workflow engine for pipelines of AI agents. It stores assembly-line definitions, decides what happens next at each step, and hands the work out to workers — it does none of the work itself. Workers (agent pods, service stations, or humans) pull their own work from a queue and post results back over HTTP.

The system is deployed as two processes sharing one container image: `apps/api` (the HTTP server and single-leased loop) and `apps/cluster-agent` (a Kubernetes worker that turns dispatches into agent pods). A Helm chart configures which process a container runs.

## Key Capabilities

- **Assembly-line execution**: runs versioned, content-addressed pipeline definitions through a graph walk driven by the visits a run has already made
- **Event-driven routing**: starts or joins assembly runs in response to external events posted to `POST /events`; supports start conditions (`when`, `args`), deduplication, and subject-scoped run coalescing
- **Distributed queue**: `FOR UPDATE SKIP LOCKED` over Postgres; workers claim by offering tag sets, so a cluster agent and a service station share one queue without polling the same rows
- **Agent pod orchestration**: `apps/cluster-agent` creates one `Agent` custom resource per dispatch and the [ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem) runs the pod; floor issues the visit token, brokers git credentials, and advances the walk when the pod reports
- **Service station SDK**: `packages/station` gives service authors one function and a claim loop; anything that can make an HTTP call can be a worker
- **Pipeline-as-file**: `packages/pipeline` exports or imports an entire pipeline (assembly line, stations, agent definitions, prompts, schedules) as a single YAML file
- **Live run journal**: `run_feed` table numbering every event in a run; exposed over WebSocket so a viewer replays from a cursor and receives live frames
- **Cost accounting**: per-visit `llm_call` records summed by day, line, station, or model; priced at what the agent definition stated when the visit ran
- **Lore converter**: `packages/lore-converter` reads a lore checkout and writes the definitions this floor runs in its place

## Core Data Model

| entity | what it is |
|---|---|
| **AssemblyLine** | A definition: a graph of nodes and edges, versioned by content hash. Describes work; never does any. |
| **Station** | A node's worker type, also versioned by content hash. Declares its outcomes, needs, and produced items. |
| **AgentDefinition** | The model, prompt, skills, and MCP servers for one agent station, versioned by content hash. |
| **AssemblyRun** | One execution of one assembly line, identified by a UUID. Its status is derived by replaying its visits — never stored. |
| **Visit** | One node opened in one run. Carries a frozen brief (needs resolved, station and agent definition pinned), a deadline, and eventually a report. |
| **Event** | A row in the events queue. Named (e.g. `station_run.dispatch`, `internal.run.started`), tagged for worker selection, and claimed under `FOR UPDATE SKIP LOCKED`. |
| **Blob** | Content-addressed (SHA-256) binary store. Files a node produces or a line declares are stored here. |
| **RunFeed** | Per-run ordered journal of everything that happens: visits opened, records appended, visits reported, run settled. |

The bag is the only channel between nodes: write-forward only, each node declares what it `needs` and `produces`.

## User Roles

| role | how they interact |
|---|---|
| **Operator** | Installs and configures floor with Helm; manages secrets, clusters, and pipeline ConfigMaps |
| **Line author** | Writes assembly-line YAML (stations, agent definitions, schedules); imports with `packages/pipeline` |
| **Service station author** | Writes a TypeScript function using `packages/station`; runs it as a long-lived worker process |
| **External caller / integrator** | Posts events to `POST /events`; reads run state and costs via the HTTP API or `packages/client` |
| **Agent pod** | Fetches its brief, posts turns and costs to `/sink`, and posts a lifecycle event to end its visit; no floor code runs inside the pod |
| **Human worker** | Answers a human node by posting a report or an event; floor serves no UI for this |
| **lore** | Posts GitHub events to `/events`, runs service stations for GitHub actions, mints git credentials for pods |

## Business Rules

- **Floor holds no provider client.** No Kubernetes, GitHub, or chat SDK lives in this repository.
- **Floor never calls out.** Every worker pulls; the only exception is the git credential broker because git waits thirty seconds for an answer.
- **Visits are the truth; events are how they change.** An assembly run's status, bag, current node, and cost are all derived by replaying its visits — nothing is stored.
- **A refusal is never retried.** The store throws `Refusal` for semantically invalid requests; the loop dead-letters such events immediately.
- **Every follow-up event is written in the same transaction that caused it.** A report and the next node's start event are one Postgres write.
- **A node that can never open fails its run.** If a required need is missing from the bag or the station is gone, the run settles as `error`.
- **A visit token is scoped to one visit.** It is an HMAC over the visit id and its deadline; checking it costs no query and nothing is stored.
- **Git credentials are scoped to one repository and one visit.** A pod gets a credential only for a `git` need declared by its station, with the access that need declares, and only until it reports.
- **Content-addressed definitions.** Assembly lines, stations, and agent definitions are stored by SHA-256 of their content. A visit pins the hashes it was opened with; a later change to a definition cannot affect a visit already open.
- **Seeding is migrations: ordered, each once.** A pipeline file that was applied cannot be changed; a change is a new file.
- **Repository names are stored lowercased.** GitHub reports the same repository under different casings; the store lowers the name on write and read so runs match across spellings.

## Success Metrics

- Assembly runs complete without manual intervention; workers pull, work, and report autonomously
- A failing station does not block unrelated runs; the walk settles only the affected run
- The loop holds a Postgres advisory lease; every other replica still serves HTTP and migrates at start without conflict
- A rolling deploy completes without downtime: every API replica that can reach Postgres is ready; `/readyz` is reachability, not lease-holding
- Agent pods reach the internet, the floor, and operator-listed cluster endpoints; nothing else (enforced by NetworkPolicy)
- CI passes on every pull request: build, test (one job per workspace, real Postgres), typecheck, lint, helm chart check, Docker build check
