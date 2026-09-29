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

**GitHub's client is a third app, and optional.** The floor holds no
provider client, and checking a webhook's signature or posting a review is
provider knowledge. `@floor/github` is where it lives. A floor with no
GitHub in its lines runs the two apps it always did.

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
than two. Authored YAML stays `snake_case`; nothing converts it yet.

**`not_before` is `availableAt`.** The lint rule against negative names
flagged it, and the positive name says the same thing.

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
client, so it asks the provider it was configured with, as a service, over
HTTP. `@floor/github` is that provider. A queue would not do: git waits
thirty seconds for its answer.

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

**The visit token is in the Agent resource, in the clear.** The subsystem
reads the broker's credential from the Agent's parameters and has no secret
reference for it. The token opens one visit's files and one visit's
repositories, and stops working at the visit's deadline.

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

## Known and accepted, for now

- An event that starts a line with no subject starts it twice if its ack is
  lost after the start. A run has no dedupe key.
- A pod killed from outside posts nothing; its visit fails at its deadline.
