# Decisions made while building

The plan left these open, or the running system closed them differently from
the plan. Each is a choice, not a fact: the reason is given so it can be
argued with. Newest last.

## The walk

**A node that can never open fails its run.** When the store refuses to open
a node, because a required need is not in the bag or its station is gone,
the run is settled as `error` with the refusal as its reason. The
alternative was a run with nothing open and nothing queued, which waits
forever and looks healthy.

**A start by hand is one that carries no iteration.** The plan said a start
event *named* other than `node.<id>.start` closes open human visits. The
kernel restarts the walk at any visit a person asked for, whatever the event
was called, so the rule follows what the kernel does: the walk posts an
iteration, a person does not.

**A report on a run that has ended is kept, and moves nothing.** A pod that
finishes after its run was cancelled still has its report written. Refusing
it would have rolled the write back and lost what the agent did.

**A refusal is never retried.** The store throws `Refusal` for a request it
will never accept. The loop dead-letters such an event at once; anything
else it retries with backoff. Before this every failure was retried eight
times, including the ones that could not succeed.

## Events

**`station_run.abort` means "let go", and is posted at every visit's end.**
The plan posted it on cancel only. A cluster agent deletes a pod and its
secret keys when it claims one, and nothing else tells it a visit is over:
the pod reports to the floor, not to the agent. It is posted only when a
worker claimed the dispatch. A separate `station_run.ended` would be a
cleaner name and was not worth a second event and a second handler.

**Internal events say whose run it was.** `internal.run.started` and
`internal.run.settled` carry the line, repo, subject, outcome and reason. A
line started by one needs a repo to run in, and had no way to learn it.

**A line never starts on an internal event of its own runs.** Otherwise a
line declaring `internal.run.settled` starts itself without end. Two lines
starting each other are not stopped.

**`when` compares text.** The plan's own examples write `draft: false`, a
boolean, against a payload field. Comparing text forms makes `false` match
`false` and `412` match `412` with no type rules to learn.

## The agent's pod

These were learned from the subsystem's source and from running it. Most of
them were wrong in the first version and could not have been caught by a
test of ours.

**The sink takes one event per request.** The plan assumed a stream of
newline-delimited JSON. The supervisor posts each event by itself, in an
envelope.

**The brief names the earlier visit, not its archive.** The subsystem
resumes a conversation by an id it also hands to the agent as its session
id, which must be a uuid. `sessionRef` on a report is still the archive's
hash, so the blob store and its reaper are unchanged; the floor finds the
archive by the visit that saved it.

**The floor serves the agent's settings.** The subsystem starts Claude
pointing at a file it fetches from the recipe's skill registry. With no
registry the agent dies at once. `/skills/settings.json` is served with no
credential, because the pod's init presents none, and so holds nothing
secret.

**Agents run with their tools allowed.** `permission_mode` is `bypass`
unless the definition sets it. A pod has nobody to answer a prompt.

**A station keeps its one finished run.** A history limit of 0 makes the
subsystem's controller delete a finished `Agent` and then run it again from
its cache. A visit that had succeeded ran its agent twice. Worth reporting
upstream; lore keeps 3 and never sees it.

**A prompt is told where things are.** `{<name>_path}` for everything with a
place in the workspace. With no repo cloned the agent's working directory
is `/`, and a prompt saying `note.md` sends the file where nothing looks. A
value need of the same name wins.

**The cluster names the model's secret.** The plan gave the cluster agent
the secret and the floor the model. What was missing is that a cluster may
hold something other than the usual API key. `FLOOR_MODEL_SECRET_KEYS` says
so, per model family.

**Skills and MCP servers are declared on the agent definition, by url.**
They shape the agent, so they sit with its model and prompt, and the station
contract is unchanged. The cost is that a url is true of one environment.
Lore's cluster agent owns both addresses and its definitions name none; the
same split can be added here later, with definitions naming a server and
the cluster saying where it is, without breaking one written this way.

**What reads `config`.** `skills`, `skills_source`, `mcp_servers`,
`disallowed_tools`, `env`, `permission_mode`, `max_turns` and
`model_secret_key`, under the names lore uses, so a converted definition
needs no renaming. They are checked when a definition is put, so a mistake
is refused then and not found by a pod.

## Service stations

**A function that throws has failed its visit; a floor out of reach has
failed nothing.** The SDK reports the first as `failed` with what was
thrown. The second hands the dispatch back to the queue, since the visit
itself may be fine.

**A service does nothing on abort.** It holds nothing between visits. The
SDK acks the event so it does not sit in the queue.

**Files go through tools, values through the return.** `tools.produce`
uploads at once and the SDK names the file in the report, so a station
never handles a blob hash.

## The API

**Bodies are `camelCase`.** The plan wrote `dedupe_key` and `not_before`.
Every type in the code is `camelCase`, and one spelling is fewer mistakes
than two. Authored YAML stays `snake_case`; nothing converts it yet.

**`not_before` is `availableAt`.** The lint rule against negative names
flagged it, and the positive name says the same thing.

**A visit's token is minted when its brief is asked for**, not stored at
open. It is an HMAC over the visit and its deadline, so checking one costs
no query and nothing has to be kept.

**Git write access answers 501.** It needs a GitHub App. Until one is
configured, a station with a `git` need declaring `access: write` cannot be
dispatched.

## Operations

**The subsystem is installed in the floor's own namespace**, `floor-agents`.
Its controller reconciles one namespace, so it sits beside another install
without touching it. The cluster-wide CRDs are applied only when missing.

**The subsystem's manifests are vendored; its images are pinned by label.**
Upstream's `deploy/` at the v0.11.6 tag still pins v0.11.3. What a digest
is, is read from the image, not from where it was found.

**The floor's port on a laptop is 8180.** 8080 is lore's floor, and running
the two side by side is the point.

**Tests have their own database.** Every suite truncates its tables. On the
database a floor was running against, that deleted a visit's clean-up event
between two runs.

## Known and accepted, for now

- An event that starts a line with no subject starts it twice if its ack is
  lost after the start. A run has no dedupe key.
- A pod killed from outside posts nothing; its visit fails at its deadline.
- Any authenticated caller can read any blob by its hash.
