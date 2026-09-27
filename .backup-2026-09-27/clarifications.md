Contradictions, fix before anything else

Two routing models. The storage doc says every node has a start event and the walk emits node.<id>.<outcome>. The store's next() still calls lore's transition kernel over edges. Either edges compile to start events and the kernel is retired, or the kernel stays and start events are only for externally started nodes. Pick one and say who evaluates iteration_max.

-> Well, I assume next will just push an event that will start the next node. this should be a copy paste, because the event will be set in the node definition

How a pod reports. The API sketch says pods report through the cluster watch and never call PATCH. The transport table says the pod wrapper uploads and reports over HTTP with the visit token. The token design only works if the second is true.
PATCH body. The API says status, outcome, note. The store's report takes a full station report with produced items, usage and failure class. PATCH should accept the report shape.

-> The pod  reports using events. I assume ai-agent-subsystem will get a route on the event-router that wiwll handle the output event, or whatever is needed.

Agent definitions. Still a top-level CRUD resource in the API, but the storage doc moved model, prompt, timeout and conversation mode into station settings with repo variants. Either agent definitions are gone, or they are what a station's settings bundle references. The API header line saying resolution rules come from lore is now false.

-> I would say references, but what do you say?

Station forms. API filter lists six forms including external. Transport table has five. The visit's worker kind has four and lacks marker and external. One list, used everywhere.

-> do what is best

Compatibility table says lore lines load through the same lib and schema. After your decisions they load through a converter that splits node-level model and prompt into stations, maps continues to conversation mode, by_hand to a manual start event, and retrospective to marker. Say so, it is a deliverable.

-> what? i don't understand this

Missing

The events table and the loop. Events drive everything now and nothing defines the row: name, payload, run id, not_before, claim, ack, attempts, dead letter. Nothing describes the drain loop, retry and backoff, or that the single-instance lease is what makes the loop safe.

-> how can we address this?



Run identity on external events. A manual.validate or github.pr.merged event must find its run. Manual carries a run id. GitHub carries a PR, which maps to a run only through subject key or a bag item. Define the lookup.
Subject key at start. Nothing says who sets it. The line's argument schema should be able to mark one argument as the subject.

-> i agree, add it

Deadlines. The token expires at the visit's deadline and the reaper fails visits past it, but the visit has no deadline field. Add it, derived from the resolved timeout at open.

-> ok, you do it


Session handle write-back. Conversation mode continue needs a session reference from the previous visit. The report has no field for the executor to return one.
Needs validation with external starts. The rule "produced on every path into it" has no paths for a node started by an outside event. Rule: such a node's needs must be seeded at start or optional.

-> ok

Human auth versus visit token. The transport table says humans use session auth, the token section says PATCH checks the visit token. Define that a session on that team and repo satisfies the same check for human-form visits.

-> ok

Line and station version tables. Both are foreign key targets and neither is defined, nor where line-shipped files live.

-> define it

Cross-run scoping. conversation_key resolves across runs; the docs never say within the same team and repo only.

->i don't undersand this.

Logs and telemetry tables. Declared out of scope but the API serves them, and standalone has no lore to hold them.
-> define them

Cancel semantics. Still an open question, and with start events it also means dropping queued events for a cancelled run.

-> ok


Stale

The API's assembly lines section still says runs clone the version.

-> i assume you have to fix it


The stations section still describes lore's three forms and says nothing of needs, produces, settings or variants.

-> fix it

The brief still carries taskId, branchName and gitDir from lore's node context. Workspace is a git item now.

-> update docs

The example doc predates start events, conversation mode and variants.
Tenancy: team_id exists only on runs. Visits, blobs and events need it or a documented reason not to.

-> fix it
