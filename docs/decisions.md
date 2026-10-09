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

**A line ends a run as failed at a node, and the outcome is always
`failed`.** A line names `fail: <node id>` beside `exit`, and a run arriving
there settles as `failed`. Before this a line could only reach the exit,
which is `success` whatever led there, so every line that wanted a failed
run wrote a self-edge with `iteration_max: 1`: a retry nobody wanted, for a
run that then settled as `iteration_max`. A node was chosen over an edge
target that is no node (`to: "@fail"`) because it reads like the rest of a
line body, shows on a graph, and needs no special case where edges are
checked. The run takes `failed` and not the outcome that led there: an
`always` edge after a `success` must not settle a failed run as `success`,
and the outcome that did lead there is in the reason.

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

**A start by hand reopens a finished run.** Whatever it settled as, a start
posted without an iteration takes the run back to open, closes as
`cancelled` any visit its settling left open, and opens the node; the walk
goes on from there and settles the run again. A person asking for a station
on a done run means it. A new run would lose the bag and the history, and
the subject index keeps one open run per subject, so a run whose subject
another open run holds is refused, naming that run. The walk's own start,
with an iteration, is still refused on a finished run: a stale walk event
never brings one back.

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
`disallowed_tools`, `env`, `permission_mode`, `max_turns`,
`model_secret_key` and `pod_resources`, under the names lore uses, so a converted definition
needs no renaming. They are checked when a definition is put, so a mistake
is refused then and not found by a pod.

**A definition sizes its own pod.** `pod_resources` on the definition's
config becomes the `resources` of the agent's container. Unset, the
subsystem's default applies; the floor holds no default of its own, since
what a pod needs is the agent's business and what a cluster can give is the
operator's.

## Converting lore

**Prompts are kept as lore wrote them.** So the floor bends where they
need it: the repo is cloned at `target`, where they look for it, and what
an agent prints can be handed on as a file, `from: output`, since they
answer in their output and lore's floor parsed that in a hook.

**A hook becomes a station, and its failure ends the run as an error.**
Lore posted a review from code that ran after the review node. Here that is
`post-review`, a station with no edge for `failed`: a review nobody could
post is not a run that went well.

**What a line's file does not say is written down by hand**, in the
converter's `known-lines.ts`: what starts a line, what it is given, what
lore's floor did around it. Reading that out of lore's code by machine
would be guessing.

## GitHub

**GitHub's client is not the floor's, and is not in this repository.**
The floor holds no provider client, and checking a webhook's signature or
posting a review is provider knowledge. lore owns GitHub: it posts GitHub's
events to `/events`, and it runs a service station for every GitHub action a
line takes. `@floor/github` held all of this and was deleted; the floor runs
the two apps it always did.

**The receiver flattens.** A line's templates read top-level fields, so the
receiver lifts what a line may want out of GitHub's nesting and names it
plainly. The alternative, templates that reach into nested payloads, puts a
path language into every line.

**A choice about the past is a station, not a condition.** A push is
reviewed in full or rechecked depending on whether a review already ran.
`when` compares fields of one event and was left that way: a router line
makes the choice and asks for a line by name. The other ways were a
receiver that looks things up, or a `when` that can ask about past runs,
which is the first step to a query language in every line.

**A review is always a comment.** Never an approval or a request for
changes, whatever the agent's verdict, as in lore. A person decides.

## Service stations

**A function that throws has failed its visit; a floor out of reach has
failed nothing.** The SDK reports the first as `failed` with what was
thrown. The second hands the dispatch back to the queue, since the visit
itself may be fine.

**A service does nothing on abort.** It holds nothing between visits. The
SDK acks the event so it does not sit in the queue.

**A station reads files from the floor it talks to.** The brief gives a
file's address as a pod reaches it, which on a laptop is a name the host
cannot resolve. The SDK takes the path and uses its own address.

**Files go through tools, values through the return.** `tools.produce`
uploads at once and the SDK names the file in the report, so a station
never handles a blob hash.

## The API

**Bodies are `camelCase`.** The plan wrote `dedupe_key` and `not_before`.
Every type in the code is `camelCase`, and one spelling is fewer mistakes
than two. Authored YAML stays `snake_case`; `floor-pipeline` (`packages/pipeline`) converts it.

**`not_before` is `availableAt`.** The lint rule against negative names
flagged it, and the positive name says the same thing.

**A visit's token reaches what a visit needs, and the floor says so in one
place.** It reached nearly every route: the routes that checked who called
were the ones somebody had thought to check. An agent in a pod holds that
token, and with it could change a definition, start or cancel any run, and
claim another worker's events. Now a route is a service's alone unless it
is marked as open to visits, and ten are. A test walks every route the
server has and asks each with a visit's token, so an eleventh is a failing
test and not a surprise.

**A visit's token is minted when its brief is asked for**, not stored at
open. It is an HMAC over the visit and its deadline, so checking one costs
no query and nothing has to be kept.

**Git asks for its credential when it needs one.** The floor is the
subsystem's git credential broker, as lore's API is in production. The pod
holds its visit token and the floor's address, and git's helper trades the
one for a token at the moment it authenticates. The other way was to mint a
token at dispatch and write it to a secret. A GitHub App's token lives an
hour and a visit may run longer, so that way fails on the push, which is the
last thing a visit does.

**The floor decides who may have a credential; a provider mints it.** The
floor knows the visit, its needs and their access. It holds no GitHub
client, so it asks the provider at `FLOOR_GIT_CREDENTIAL_URL`, over HTTP: `{ repoUrl, access }` in, `{ username, password }` out, answered
inside twenty seconds. lore is that provider. A queue would not do: git waits
thirty seconds for its answer.

**The provider is asked with a token of its own.** The floor presents
`FLOOR_GIT_CREDENTIAL_TOKEN`, never `FLOOR_SERVICE_TOKEN`. The service token
opens the whole floor, and the provider is another system. A floor with a
provider URL and no token for it refuses to start, so the gap shows at
deploy and not on the first push.

**A visit gets a credential only for a repository it has a `git` need for,**
with the access that need declares, and only until it reports. A read need
gets one too, so a private repository can be cloned.

**The token is good for one repository's contents.** Not pull requests, not
workflows, not the rest of what the app may do. It is minted each time and
never kept. A token given outright, `GITHUB_TOKEN`, is never handed to a
pod: it belongs to a person and cannot be narrowed.

**Without a provider, a visit that would write is not dispatched.** Its
brief is refused. The other way is an agent that works for an hour and then
cannot push.

**The agent pushes its own commit.** lore's `code-review-refine` prompt has
the agent commit and never push, and nothing in lore pushes for it: not the
floor, not the subsystem, not a hook. The fix stays in the pod. Here the
converter adds the push to the prompt, after lore's own words, and gives the
station write access. Only the pod holds the commit, so only the pod can
push it.

**A pod that may write commits as Floor Agent.** git refuses to commit for
nobody, and a pod is nobody until it is told. The cluster agent sets git's
own variables on every visit with write access to a repository, as lore
does, and an agent definition's `env` may name someone else. The name is
floor's and not lore's, so a commit is not taken for one lore made.

**A review's inline comments are read from the pull request's list.**
GitHub's list by review names the file and never the line. The pull
request's own list names both, and each comment's review. A comment whose
line has since changed keeps the line it was written on.

**`code-review-reply` is started by a person's review, never a bot's.** The
post-review station posts reviews that ask for changes. Without `sender_type`
in the line's `when`, each of those would start a reply to itself.

**A repository's name is kept lowered.** GitHub reads `re-cinq/Otto` and
`re-cinq/otto` as one repository, and says `Otto` in its webhooks whatever a
person typed. The store lowers the name where a run is written and where one
is looked for, so both find the same run. A branch is kept as written: git
reads its case. So is a value such as a pull request's address, which the
floor does not know to be an address. Runs written before this keep the
spelling they had.

**What floor posts says that floor posted it.** On a laptop floor posts as
the same GitHub App production lore does. Its first real review landed
beside one of lore's that said the opposite, under the same name. Every
review and reply now ends with a line saying it is floor's, and of which
visit.

**A stranger's review starts nothing.** Anyone may review a pull request on
a public repository and ask for changes. What the review says becomes the
task of an agent that may push, so `code-review-reply` starts only for a
review GitHub attributes to an owner, a member or a collaborator.

**What an agent said is read from wherever it said it.** Claude ends its
stream with a line that repeats its answer and gives its cost. Gemini ends
with a status and its counts, and says its answer in pieces along the way.
When the last line carries no words, the floor puts the answer together
from the pieces. Without that a Gemini agent's verdict read as empty, which
passes as success.

**A pipeline is one file, and the tool that reads it is a client.** An
assembly line with every station, agent definition, prompt, file and
schedule it needs, in YAML. `floor-pipeline` exports one, imports one, and
runs a folder of them. It adds no way into the floor: it uses the routes
any client uses, so what it can do, HTTP can do.

**Seeding is migrations: ordered, each once.** The other way was a folder
the floor is made to match at every deploy. Then an edit made over HTTP is
lost at the next deploy, and nobody is told. Here a file that ran is not run
again, so what a person changed stays until a later file says otherwise. A
file that ran and was changed since is refused: a change is a new file.

**The floor remembers which files ran, and runs none.** It keeps each file's
name and the sha256 of what it held. Applying a file stays outside, in the
tool.

**A file holds a line's files by their content.** The floor keeps them by
their hash, and a hash is no backup.

**The floor holds no price.** Gemini counts tokens and names no cost, so
somebody has to multiply. lore keeps a table in its code, which goes stale
and is changed by a release. Here an agent definition states what its models
cost, beside their names. A visit is priced when it ends, at what its
definition stated then, so a price that changes changes no visit already
run. A model with no price stated is named and left out: a cost that is
short says so.

**An agent's counts are kept model by model.** An agent calls more than the
model it was given, and each has its own rate. The floor first kept the
totals alone, and could no longer tell a cheap model's tokens from a dear
one's.

**A laptop with a gcloud login reaches Gemini through a relay.** A pod is
given variables, and a gcloud login is a file that opens a whole account and
never expires. So the file stays on the laptop: a relay there asks Vertex AI
as its owner, and the pod holds a key made for one walk, which opens the
relay and nothing else. A one-hour token was tried first and Google refused
it, for want of a quota project.

**The visit token is in the Agent resource, in the clear.** The subsystem
reads the broker's credential from the Agent's parameters and has no secret
reference for it. The token opens one visit's files and one visit's
repositories, and stops working at the visit's deadline.

**A run has one cursor, and Postgres keeps it.** A record's `seq` counts
within a visit and a kind, so a viewer of a run had five cursors a visit and
no order between them. The journal, `run_feed`, numbers everything in a run
in one sequence. Triggers write it and not the code: records, visits and
runs are written in at least seven places, and the eighth would have
forgotten.

**The journal has no gaps, at the price of a lock.** A sequence skips a
number when a transaction rolls back, and a viewer cannot tell a skipped
number from a lost frame. So an entry takes the run's advisory lock and the
next number. Writers of one run wait for each other until they commit;
writers of different runs do not.

**Live is a WebSocket a run, and lore relays it.** The browser subscribes
and unsubscribes on the socket lore already gives it. lore-api opens a
socket to the floor for that one run and closes it on unsubscribe. So the
floor has no channels, no subscribe messages and no browser sessions, and
a connection's life is the subscription's.

**A refused viewer is told by a close code.** The floor takes the upgrade
up and then closes with 4401, 4404, 4400 or 4429. A refused upgrade has an
HTTP status that few WebSocket clients show.

**A slow viewer is dropped, not waited for.** What waits to be read is held
in the floor's memory. Past 4 MB the connection is cut, and the viewer comes
back with its cursor and replays from the journal.

**What a viewer says is answered `unsupported`.** The way in is kept for a
person's word to a running agent. Answering now, instead of ignoring or
closing, means giving it a meaning later breaks no client.

**A run list is ordered by when the run began, and the cursor carries both
columns.** The list said newest first and ordered by `id`, but a run's id is
a random uuid, so a page of fifty was an arbitrary fifty and the cursor
walked them in no order anyone could name. Ids never were an order. The list
is now `created_at desc, id desc`, the order of the index that was already
there, and the cursor is the last run's `(created_at, id)`, so two runs
created at the same instant are neither repeated nor skipped at a page
boundary. The timestamp travels as Postgres wrote it, microseconds included:
through a JS `Date` it would lose them and put a run back on the page it had
just left. The cursor is an opaque string the client hands back unchanged,
and one the floor did not make is refused 400. A run carries `createdAt` on
the wire, since a client that orders by it has to be able to read it.

**A run with no repository has a null `repo`, and null is a repo of its
own.** Some work belongs to no repository: a tick that fans out, a run per
Slack channel, an org-wide sweep. Such a run used to carry a made-up repo, or
was refused. An empty string was the cheap way, since the unique index on
`(repo, subject_key)` would have gone on working untouched; it was not taken,
because every reader would then have to know that `""` means "none". The
index is `nulls not distinct` instead, which needs Postgres 15, so two
repo-less starts on one subject join as two starts on one repo do. A line
with a `git` argument is refused a start without a repo, since its stations
would have nothing to clone. The run list asks for these runs with
`withoutRepo=true` and not with an empty `repo`, so a caller who sends an
empty string by accident is not answered with them.

## Operations

**The subsystem is installed in the floor's own namespace**, `floor-agents`.
Its controller reconciles one namespace, so it sits beside another install
without touching it. The cluster-wide CRDs are applied only when missing.

**The subsystem's manifests are vendored; its images are pinned by label.**
Upstream's `deploy/` at the v0.11.6 tag still pins v0.11.3. What a digest
is, is read from the image, not from where it was found.

**The floor's port on a laptop is 8180.** 8080 is lore's floor, and running
the two side by side is the point.

**One chart, one image, one version.** Both apps are built into one image
and the chart picks which to run. `version` is the tag of that image, so
the API and the cluster agent cannot be deployed at different versions of
the brief they exchange.

**Every replica serves; one runs the loop.** The plan made `/readyz` the
lease. Then a second replica is never ready, `helm install --wait` never
returns, and a rolling update waits for a pod that cannot be ready while
the old one lives. The API keeps nothing between requests, so nothing is
lost by letting every replica answer. `/readyz` is now "can reach the
database", and `/version` says whether this instance runs the loop.

**Migrating takes a lock.** Every API replica migrates when it starts, and
the chart's hook Job migrates too, so three may start at once. `create table
if not exists` is not safe against itself: two of them collide inside
Postgres. `migrate` now holds an advisory lock for its whole run. The second
waits, then finds nothing left to do. The API still migrates at start,
because a laptop has no hook Job.

**The cluster agent stops when it is told to.** It ignored SIGTERM, so
Kubernetes killed it mid-dispatch, between the three resources a dispatch
creates. Told to stop, it now finishes the tick in flight and claims nothing
more. Its idle sleep, which grows to a minute, is cut short, and the pod is
given sixty seconds where Kubernetes gives thirty. A request to the floor
gives up after thirty seconds, so a floor that hangs cannot hold a stop.

**The image holds the pipeline tool and not the converter.** A job in the
cluster seeds pipelines with `floor-pipeline`, so it is in the image. The
converter reads a lore checkout from a person's disk, which a pod has not
got, so it is built and left out.

**Pipelines are seeded by a job that waits for the floor.** A Helm hook runs
when the floor's pods are created, not when they are ready, so the job asks
`/readyz` until it answers. The files come from a ConfigMap the operator
names. A file changed after it ran fails the job, and so the upgrade: a
change is a new file.

**The chart refuses an install it knows is broken.** An empty `version`
rendered an image name no registry has, and a missing `api.existingSecret`
rendered pods that never start. Both are refused before anything is applied.

**The cluster agent outlives the floor.** A claim that cannot reach the
floor is a tick that found nothing. It used to end the process, which on a
fresh install starts before the floor does.

**Tests have their own database.** Every suite truncates its tables. On the
database a floor was running against, that deleted a visit's clean-up event
between two runs.

**A blob is reaped by age as well as by name.** The plan reaped a blob
"when no visit references its hash and no run is open", which on a busy
floor is never. It is reaped when nothing names it and it is more than a
day old.

**A settled run tells its value arguments.** `internal.run.started` and
`internal.run.settled` carry `args`, the run's `value` start items by name.
Whoever reacts to a run ending knows which task or pull request it was
without asking the floor again. Values are small; files and repositories
are left out, since a file's ref is a blob hash and its content may be
large or private.

**An agent's pod reaches the internet, the floor, and what the operator
lists.** The chart ships a NetworkPolicy for the pods the subsystem runs,
on by default: DNS, port 443 outside the private ranges, the floor's api.
Nothing reaches a pod. The subsystem ships the same rules for its own
namespace, and the floor runs its agents in another. What lore's agents call
inside the cluster is not known to this chart, so it is a value.

**A release is a pushed `vX.Y.Z` tag, and the tag is the version.** Pushing
the tag starts `publish.yml`: the tag is checked, the gates run again on the
tagged commit, and then the image, the four npm packages, the deploy, and
last the GitHub Release with its notes. The packages carry a placeholder
version on `main` and are stamped from the tag, so no commit bumps a
version. It was a published GitHub Release that started it, as HALEngine and
bowman-ui do; a release is now one push, with nothing to click after
(2026-09-30).

**The npm packages are `@re-cinq/floor-contracts`, `@re-cinq/floor-client`,
`@re-cinq/floor-station` and `@re-cinq/floor-pipeline`.** The last two were
`@floor/station` and `@floor/pipeline`; re:cinq publishes under `@re-cinq`, and holds no
`@floor` on npm. The packages that are
not published keep `@floor`. They are licensed Apache-2.0, as every package
re:cinq publishes is.

**npm is published without a token, directly.** Trusted Publishing trades
the workflow's OIDC token for a credential, so the repository holds no npm
secret. The versions were staged at first, each waiting for a maintainer's
2FA before anyone could install it; that hand was the one step of a release
that was not automatic, and the brake now sits in front of the tag instead:
the tagged commit must be on `main`, and `main` takes a pull request
(2026-09-30). The first version of each package is published by hand, since
a trusted publisher is registered on a package that exists.

**`latest` is main's.** A release publishes `1.2.3` and `1.2` and leaves the
image `latest` where `main` put it. A release of an older commit would
otherwise move it backwards.

**The chart's `version` is set as a string.** A short SHA of seven digits
is a number to `helm --set`, and one such as `1234e56` is a number with an
exponent.

**An agent pod is let through to the node's DNS cache.** The policy allowed
the cluster's DNS pods and the internet, and excluded link-local to keep a
pod away from the cloud's metadata endpoint. Where NodeLocal DNSCache runs,
which is every GKE cluster, a pod asks a link-local address on its own node
and so resolved nothing: the first agent in a real cluster could not look up
the floor's own address. lore's own policy had the rule; the subsystem's
vendored one, which this was copied from, does not.

**The chart is walked, not only rendered.** `check-chart.sh` renders the
chart and reads what came out. `walk-chart.sh` installs it in minikube and
runs an agent through it. The first walk found what no rendering shows: an
agent's pod is the controller's, so the chart's pull secret does not reach
it, and an install that does not name the model's secret key leaves the pod
waiting for a key that is not there.

## The client, and the wire it reads

**The wire is one declaration, in `@re-cinq/floor-contracts`.** The store
instantiates it, the api annotates its handlers with it, and the client
reads it back. Four hand-rolled clients had written the same shapes out
themselves and the copies had already drifted: one omitted a git need's
`access`, another a visit's `iteration`, and the rename a route does on the
way out was named on neither side. The root of it was one missing return
type on `briefResponse`; annotating it made the wire a fact the compiler
checks.

**A type is a wire type only if it is already valid JSON-after-parse.** No
`Date`, no `Buffer`. A row the store keeps has `finishedAt: Date` and the
same row on the wire has a string, so a row is declared once, parameterised
on its timestamp, and read two ways: `Run` is `RunFields<Date>` and `RunView`
is `RunFields<string>`. The `*View` name carries the difference, and
`apps/api/src/wire-contract.test-d.ts` proves the two sides agree, the live
socket's frames included.

**Validate across a trust boundary you do not own; annotate across one you
do.** The floor validates what a git credential provider answers, because
that is somebody else's service. The client casts, in one function, because
a floor talking to itself is checked at the source. Validating in the client
would find the same drift later and worse, as a throw in someone else's pod,
and would cost every station author a dependency.

**A status that carries a decision is in the return type.** Absence is null,
an empty queue is an empty list, and a brief answers `brief`, `reported` or
`absent`, because a claim loop does something different for each. A station
used to read the last two both as null and could not tell them apart, while
the cluster agent threw on both and retried a settled visit until its event
died.

**A visit client is built for one visit and takes an id in no method.** The
floor refuses a visit token that reaches for another visit; binding the id at
construction refuses it a step earlier, where it cannot be written.

## Fan-out and join

**A fan-out region folds into one visit of its body.** The walk kernel keeps
one cursor, and a run can now have several visits of one node open at once.
Rather than teach every rule about branches, the kernel folds a finished
region's branch visits into a single visit of the body, `success` or `failed`,
and replays as before: routing, the join edge and `iteration_max` are
unchanged. Only the new `launch-many` step knows about branches: it starts
every branch at once, and starts the ones a crash left unstarted.

**The list is a value; branch results are values or files.** A source's list
rides in its report like any produced value, so the store needs no new channel
to count branches, and a body reaches heavy content through the bag by entry.
A join collects what the branches produced in branch order: a value as it is,
a file as its text, read from the blob store when the join opens. An agent
branch hands back a file far more easily than a value, which has to ride inside
its one-line result marker.

**A failed branch fails the region after the rest have finished.** Cancelling
siblings loses work that already cost; collecting partial results lets a join
run on a lie. The line decides what a failed region means through the edges
out of the body.

**Reports take the run's lock before the next step.** Without it two branches
reporting together could each see the other still open and nobody would launch
the join.

**Not done:** a start by hand of a fan-out body opens an ordinary visit and
restarts the walk there; an outside event that answers a waiting node answers
one open visit of a node, not a chosen branch; the live feed shows branches as
visits of one node; there is no cap on the length of a list; every report takes
the run's lock, fan-out or not, one extra round trip a report that a check on the
line's nodes would save; the lock key is a 32-bit hash of the run id, so two
runs can share one, which only makes them wait for each other.

## Known and accepted, for now

- An event that starts a line with no subject starts it twice if its ack is
  lost after the start. A run has no dedupe key.
- A start by hand whose ack is lost after the run it reopened has settled
  again reopens it a second time.
- A pod killed from outside posts nothing; its visit fails at its deadline.
- The network policy for agent pods is rendered, installed and selects the
  pods, and has never been seen to bind: minikube's default network plugin
  enforces none.
- A pod that printed no `LORE_NODE_RESULT` line and wrote none of the files its
  station declares by path fails its visit, naming the files, whatever exit code
  its supervisor reported: read as success, the next node failed on a need nobody
  could fill, and the run died where nothing was wrong (lore's run bce29270, a
  Gemini pod that ended nine seconds in). A pod that spoke a marker is believed,
  so a line that treats a missing file as a retry keeps working.
