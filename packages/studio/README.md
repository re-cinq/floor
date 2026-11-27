# @re-cinq/floor-studio

A local studio for a collection of assembly lines. A collection is a folder with one folder per assembly line, at the top or in a group folder, each holding `assembly-line.yaml` and `agents/<agent>.md`. The studio reads the folder and tells every client what it holds: each assembly line with its nodes, edges and problems, each agent with its settings and prompt, and each file it refused and why. A change to a file on disk reaches every client at once.

This package is the backend, the protocol, the command that starts them, and the page that draws the assembly lines (`web/`). It is published to npm, so this starts it without a checkout:

```
npx @re-cinq/floor-studio path/to/collection
```

## The four parts

| part | where | what it does |
|---|---|---|
| Backend | `src/backend`, exported as `@re-cinq/floor-studio/backend` | Headless. `startStudio({ dir, port, hostKeys, origins })` listens on `127.0.0.1` and speaks WebSocket only. It serves no page and knows nothing about a browser |
| Protocol | `src/protocol.ts`, exported as `@re-cinq/floor-studio/protocol` | Every frame as a zod schema and its type. It imports nothing from Node, so a browser bundle can take it |
| Shell | `src/cli.ts`, the command `floor-studio` | Parses the arguments, starts the backend, serves the built page from `dist/web` over plain HTTP on `127.0.0.1`, and opens the browser. A desktop app would replace only this part |
| Page | `web/`, built into `dist/web` | A Vite and React app, one client of the backend. It takes the socket and the token from its address and draws the collection |

## Run it from the checkout

```
npm install
npm run build
node packages/studio/dist/cli.js path/to/collection
```

```
floor-studio [dir] [--port <n>] [--host-key <name>]... [--no-open]
```

| option | meaning |
|---|---|
| `dir` | The collection. Default: the current directory. A directory that does not exist is an error, exit 1 |
| `--port <n>` | The port of the backend's socket on `127.0.0.1`. Default: a free one. The page's own port is always a free one |
| `--host-key <name>` | A frontmatter key the host owns, accepted in an agent file and left out of its settings. Repeat it as often as needed. The `host_keys` of the collection's `floor-collection.yaml` count too, and are read again when that file changes. Studio reads its `groups` as well |
| `--no-open` | Print the url and do not open a browser. Without it the studio waits 3 seconds and opens the default browser with `xdg-open`, `open` or `start`. It skips that when a page has connected by then, such as a tab left open from before a restart. Failing to open a browser is not an error |
| `--help` | Print the usage and exit 0. A bad argument prints the usage to standard error and exits 2 |

It prints one line, `floor-studio: <url>`. The url is the page's. What the page needs is in the fragment, which a browser does not send to a server:

```
http://127.0.0.1:<page port>/#socket=ws%3A%2F%2F127.0.0.1%3A<socket port>&token=<token>
```

When `dist/web` does not exist the page server answers a plain page saying the page is not built. It serves only files under `dist/web`, with `Cache-Control: no-store`. It refuses a path that leaves the folder, by `..`, by a percent-encoded `..` or by a symlink.

## The page

`web/` holds the page: Vite, React and TypeScript, styled with plain CSS custom properties and CSS Modules in lore's look. The tokens are in `web/src/theme/theme.css`, the fonts are IBM Plex Sans and JetBrains Mono as local files, and the theme is light, dark or auto. It draws the assembly lines with [`@re-cinq/floor-graph`](../graph/README.md) and loads nothing from another host. Everything the page needs is bundled, so React, Vite and the test tools are devDependencies and the published package needs none of them at run time.

| where | what |
|---|---|
| `npm run build -w @re-cinq/floor-studio` | `tsc` writes `dist` except `dist/web`, then `vite build` writes only `dist/web` (it empties that folder and nothing else), so the two steps do not depend on their order |
| `dist/web/index.html` | The built page, the one the command serves |
| `npm run dev:web -w @re-cinq/floor-studio` | The Vite dev server with hot reload |
| `npm run typecheck -w @re-cinq/floor-studio` | Checks `src` and `web` |

To work on the page, start a backend and give the dev server its address:

```
node packages/studio/dist/cli.js path/to/collection --no-open     # prints floor-studio: http://127.0.0.1:<page port>/#socket=...&token=...
npm run dev:web -w @re-cinq/floor-studio                           # serves http://localhost:5173/
```

Open `http://localhost:5173/` with the fragment the command printed (`#socket=...&token=...`). The backend refuses a browser page whose origin it was not told. The command allows only its own page, as `127.0.0.1` or `localhost` on the page's port. To allow the dev server, start the backend from a script with `startStudio({ ..., origins: ["http://localhost:5173"] })`.

### Selection

The page keeps the selected assembly line and node in the fragment (`&line=<id>&node=<id>&tab=<tab>`), so a reload keeps the place.

- Clicking an edge or its label selects that edge and drops the node (`&edge=<from>|<to>|<event>`). A Line inspector shows its stations, its event, whether it is on the main path and its iteration limit.
- Choosing another node keeps the tab, or falls back to the first tab when that node lacks it. Escape clears the node and the tab.
- A `collection` push redraws the page in place and keeps the selection while the assembly line and node still exist.

### Screens

- No address.
- Connecting.
- Cannot connect. The page retries with backoff and reads the collection again once it is back.
- Refused: a wrong token or another protocol version. It is not retried.
- Unreadable: the collection could not be read, shown with the reason. An unasked `refused` push, such as the folder being deleted, replaces a collection already drawn.
- An empty folder.
- The line view.

### The inspector tabs

The right-hand inspector shows the selected node's id and station, with tabs by kind. A marker has none. A station has Station and Events. An agent adds Prompt, Run and the five settings tabs. The arrow keys move between tabs and wrap, and Home and End go to the first and last.

| tab | what it shows |
|---|---|
| Station | The description, each need with a sentence on how it is covered, each produce with the downstream nodes that read it, and the outcomes |
| Events | What starts the node: an edge, an outside event, or the assembly line's own start, with its condition. The outside events that answer it, with the outcome each reports. What it raises: its events, each outcome with the node its edge starts (or that the run stops there), and the assembly lines a settled run starts |
| Prompt | The agent's prompt with each `{placeholder}` marked by its state, by the same name rule the lint uses (`placeholderPattern`). A table of the placeholders with their source, state and the nodes that fill them. The needs the prompt never uses. An editor when connected |
| Run | Runs this one station on your machine, see [Running one station](#running-one-station) |
| Model | `model`, `permission_mode`, `max_turns`, `model_secret_key` |
| Tools | `skills`, `skills_source`, `disallowed_tools` |
| MCP | `mcp_servers` |
| Pod | `image`, `timeout_minutes`, `env`, `pod_resources` |
| Other | `tags`, `prices` and the rest of `config` |

The settings tabs show each setting the agent file writes. Without a studio connection a settings tab is a read-only `key: value` list, with objects and lists as compact JSON.

### Editing

Connected to a studio, the Prompt tab has an editor and "Save prompt". Each settings tab has a form and "Save settings", with a field per setting and nested ones such as `config` as YAML. Numbers stay numbers.

A save sends `agent.write` with the version of the file the edit started from. The backend refuses it when the file changed on disk since, or when the agent file it would write fails the same check the collection read uses. The tab shows the reason.

With no unsaved edits, a change on disk shows at once. With unsaved edits, the edits are kept and the tab offers "Take the version on disk" or "Keep my edits". A save before choosing is refused.

An agent extended by `<line>/agents/<agent>.extra.md` (or `<group>/<line>/agents/<agent>.extra.md`) also gets an "Extra prompt" editor for that file's text on its own, saved with the same version check. The studio is told no shipped agents, so it shows no merged prompt and the collection still lists the extension as refused.

### Running one station

The Run tab of an agent node runs that station alone, with the agent CLI on your machine. It runs `claude` or `codex`, by the agent's model. Any other model family is a blocker.

The tab has a field for each need:

| need | what you give | what the studio does |
|---|---|---|
| value | text | passes it as is |
| file | the path of a file | copies it to the need's path in the folder |
| git | the path of a checkout | links it at the need's path. It links the real checkout, so the agent's commits land in it |

Folder is where the run happens. Permission is `acceptEdits` or `bypass`, as in the pod.

Preview shows the rendered prompt, the command and the blockers. A blocker is a required need with no value, a source path that does not exist, a model the studio cannot run, a picked folder that is not an absolute path, or a need or produce whose declared `path` would land outside the picked folder (`../outside/plan.md`; a name that only begins with two dots, such as `..notes/plan.md`, stays inside and is allowed). A run with blockers is refused before the folder is created, and nothing is saved.

Run starts it and Cancel stops it. The transcript streams in as what the agent said, each tool it called (`› Read tests.json`), each refusal in red, and the run's turns, time and cost. Raw shows the lines as `claude` printed them.

When the run ends the tab shows the agent's final answer under Answer. Its words are text, and any JSON object in it is laid out field by field, each list item a numbered block, with the `LORE_NODE_RESULT` line left out. Below it, each under its label:

- the outcome, which is the agent's verdict read from its final result
- the exit code, none when cancelled or when the agent's program could not be started, in which case the reason is shown (`could not start claude: spawn claude ENOENT`)
- each produce as found or missing. A produce `from: output` is found when the agent gave a final answer
- the edge taken, which is also lit on the graph
- the events raised next

Two things match the pod. The run gets the agent's `config.env` over the studio's own environment, so `CLAUDE_CODE_DISABLE_CLAUDE_MDS` and the like apply. And `/workspace`, as the pod spells the working folder, is replaced by the picked folder in the prompt's text and in the `<name>_path` parameters. The folder goes in as written: a folder whose own path has a `workspace` segment, a `$` or a `{name}` is not rewritten again.

The need values are saved in `.floor-studio/fixtures/<line>/<node>.json` and each run in `.floor-studio/runs/<id>.json`, both in the collection folder. They are keyed by the line's name, so they do not move when a line folder moves into a group folder. The store folder gets a `.gitignore` of `*` on its first write. The run's id is kept in the page's fragment (`&run=<id>`), so after a reload the tab reads the transcript again with `run.read`, also for a run still going. Closing the studio cancels its runs.

### Testing a whole line

The backend can run a whole assembly line on your machine as a test run (`startTestRun` in `src/backend/test-run-session.ts`), through the `test.*` and `folder.*` requests in the protocol. The page's Test locally button opens a start screen (workspace folder, inputs, blockers, permission, Start); the run screen lists the visits, offers a waiting visit's actions (a file output is pasted or given as a path on disk, not both), and has Cancel and the folder buttons. Every path is picked in one modal dialog, `PathPicker` in `web/src/app/PathPicker.tsx`: a folder or a file, opening in the typed folder or else the home folder of the user the studio runs as. In file mode it lists only the files matching the chosen mask, and a file output declared at `annotated.md` offers `*.md` first, with All files always on offer. Its path bar works like a zsh line: the text after the last `/` filters the folder case-insensitively, by prefix and else by substring, hiding dot entries unless it starts with a dot; typing or deleting a `/` opens that folder; Tab completes one match in full or several to their common prefix; Enter chooses a file typed in full, opens a folder typed in full, or in folder mode uses the shown folder. On either screen, a refused request shows its reason until a later request succeeds. When the connection drops and returns, the run screen reads its run again, since pushed changes are not replayed. The workspace and inputs a line was last started with are remembered per collection in `$XDG_CONFIG_HOME/floor-studio/last-tests.json` (or `~/.config/floor-studio/last-tests.json`), written when a start succeeds; a file that is not valid JSON counts as nothing remembered, and a failed write never fails the start.

A test run reads the line as saved on disk. It is refused before anything is written when an argument or line file has no value, or when the line cannot run locally: it fails validation, a node pins a station (`reviewer@abc123`), or a node fans out. One message lists every reason.

The floor's routing kernel decides each next step. An agent station runs with the same code as the Run tab. Any other station waits for a person, who answers with an outcome, values, and a file for each file output, picked from disk or pasted. The answer is refused, and the visit stays open, when the outcome is not the station's, a required field is neither entered nor supplied as a file, a picked file is not an absolute path, not on disk, or a folder rather than a file, a file is for an output that is not a file output, or the output's path leaves the visit's `outputs/` folder. A picked file that cannot be copied after the checks (it vanished, say) refuses the answer with the copy's error and leaves the visit open, so the person can answer again. A visit answers once, and a settled run takes no answers or events. An external event answers each waiting visit whose node `reports` match it, and is recorded in the timeline whether it answered anything or not. Cancel stops the running agent, or ends the wait for a person, and settles the run as `cancelled`. A cancel that arrives before the agent has started stops it as soon as it starts. Writes of a run's `timeline.jsonl` and `run.json` go one at a time, in the order they were asked for, so the last `run.json` holds the latest state. Test runs live as long as the studio: they are not resumed after a restart.

A run never hangs on a failure. An agent that cannot be started (any blocker the Run tab would show) fails its visit with the blocker as the reason, and so does an agent that leaves a declared output as a link instead of a file it wrote, or reached through a linked folder (`notes/draft.md` where `notes` is a link): nothing is copied. Any other error while the run steps, a failed disk write for one, settles the run with outcome `error` and the error's message.

The run is recorded in a new folder inside the workspace folder you give, named after the line and the start time in UTC:

```
review-loop-20261127-141230/
  definitions/        the collection as it was when the run started; the run reads only this copy
  run.json            line, start time, start items, status, ending, and time and cost per node and in all; rewritten on every change
  timeline.jsonl      run_started, visit_opened, visit_reported, event_received, run_settled, each with its time
  visits/
    001-write-1/
      inputs.json     what the station received, written when the visit opens
      prompt.md       the rendered prompt (agent visits)
      transcript.jsonl
      work/           the agent's working folder
      outputs/        a copy of each file output, so a later visit never overwrites it; a file a person supplies goes at the output's declared path, or under the output's name when it declares none
      visit.json      mode (local or simulated), opened, reported, durationMs, the agent's own time and cost, outcome, next node
```

`durationMs` is the wall time between opened and reported. `agentDurationMs` and `costUsd` are what the agent stated, and are absent when it stated none.

### The environment

The sidebar lists the variables the settings name as `${NAME}`, with the files using each. A setting written that way shows as a chip, `env: NAME`. The studio does not fill it.

Override opens the field to type a value in its place. Saved with nothing typed, the setting keeps its `${NAME}`.

The install that applies the collection fills the variable in once, and applying fails when it is not set. In Lore it is set on lore-api by its Helm chart, or in `.env.local` when Lore runs locally.

## Use the backend on its own

```ts
import { startStudio } from "@re-cinq/floor-studio/backend";

const studio = await startStudio({ dir: "collection", port: 0, hostKeys: ["review_required"], origins: [] });
// studio.url is ws://127.0.0.1:<port>; open it with ?token=<studio.token>
await studio.close();
```

`startStudio` resolves to `{ url, token, close }`. `url` has the real port and not the token. `close()` closes the sockets, the server and the watcher. `startStudio` rejects when `dir` is not a directory.

Three functions of the backend's source are what a caller that runs more than one station builds on. `readCollectionView(dir, hostKeys)` reads the view of any collection folder, not only the one the studio was started in. `previewOf(collection, request)` works out a node's run against a view it is handed, and `previewFor(context, request)` does the same against the studio's own folder. `startAgentRun(context, previewed, { node, folder })` runs the agent and resolves to `{ run, ended }`, where `ended` is a promise of the same ending the `run.ended` frame carries. `run.start` is `previewFor` followed by `startAgentRun`, so a station runs through one piece of code whoever starts it.

## The protocol

Every frame is JSON in one WebSocket message. A request carries an `id` the client chooses and is answered by one `result` or `refused` frame with that `id`. The backend also pushes frames nobody asked for.

| direction | frame | when |
|---|---|---|
| backend to client | `{ type: "hello", version }` | First, when a socket opens. `version` is `PROTOCOL_VERSION` |
| client to backend | `{ id, type: "collection.read" }` | The client wants the whole collection |
| client to backend | `{ id, type: "agent.write", line, agent, prompt, settings?, version }` | Rewrite an agent file. The body becomes `prompt`, and the frontmatter becomes `settings` when given, with comments and key order kept. `version` is the sha256 of the file as the client read it (each node's `agent.version`). Refused when the assembly line has no such agent, the file changed since, or the file it would write fails the agent-file check. The result is `{ written: <file> }` |
| client to backend | `{ id, type: "extra.write", line, agent, text, version }` | Replace the whole text of the agent's `.extra.md` (each node's `extra`). `version` is the sha256 of the file as read. Refused when the assembly line has no extra file for that agent or the file changed since. The text is saved ending in one newline. The result is `{ written: <file> }` |
| client to backend | `{ id, type: "fixture.write", line, node, needs }` | Save the need values (`needs`, a text for each need name) of a node in `.floor-studio/fixtures/<line>/<node>.json`. The result is `{ written: <file> }` |
| client to backend | `{ id, type: "fixture.read", line, node }` | Read the saved need values of a node. The result is `{ needs }`, empty when none were saved |
| client to backend | `{ id, type: "run.preview", line, node, fixture, folder, permission }` | What a run would do. The result is `{ prompt, command, copies, links, blockers }`. `permission` is `acceptEdits` or `bypass` |
| client to backend | `{ id, type: "run.start", line, node, fixture, folder, permission }` | Start a run of an agent node. Refused when the preview has blockers. The result is `{ run }`, the run's id |
| client to backend | `{ id, type: "run.cancel", run }` | Stop a running run. Refused when none runs under that id. The result is `{ cancelled: run }` |
| client to backend | `{ id, type: "run.read", run, after }` | The transcript of a run from line number `after` on, running or ended, also after a restart. The result is `{ lines, ended? }` |
| client to backend | `{ id, type: "test.preview", line, entered }` | What starting a test run of the line would take. The result is `{ asked, missing, blockers, startItems, definitions }`: each argument and line file asked for with its kind, the ones without a value, why the line cannot run locally, the start items, and the collection files a start would copy |
| client to backend | `{ id, type: "test.start", line, workspace, entered, permission }` | Start a test run of the line as saved on disk, in a new folder inside `workspace`. Refused, with nothing written, for the reasons the preview lists, a workspace that is relative or not a folder, or a run folder that already exists. The result is `{ run, folder }` |
| client to backend | `{ id, type: "test.last", line }` | The values the line was last started with in this collection. The result is `{ workspace, entered }`, or `null` when nothing is remembered |
| client to backend | `{ id, type: "test.report", run, visit, outcome, produced, files? }` | Answer for a waiting visit, as the person standing in for its station. `files` maps each file output to `{ picked: <path> }` or `{ pasted: <text> }`. The result is `{ reported: visit }` once the run has stepped on |
| client to backend | `{ id, type: "test.event", run, event, payload }` | Send an external event. It answers each waiting visit whose node `reports` match it, as the floor does, and is recorded either way. The result is `{ answered }`, the visit ids |
| client to backend | `{ id, type: "test.read", run }` | The run's state. The result is the same `state` that `test.changed` carries |
| client to backend | `{ id, type: "test.cancel", run }` | Stop the run's agent, if one runs, and settle the run as `cancelled`. The result is `{ cancelled: run }`, sent once it has settled |
| client to backend | `{ id, type: "folder.list", path? }` | The names in a folder, for the page's picker: `{ path, parent, folders, files }`, each sorted. With no `path` it lists the home folder of the user the studio runs as. `parent` is `null` at the root. File contents are never read. Refused when `path` is relative or not a folder. A link to a folder is listed under `files` |
| client to backend | `{ id, type: "folder.open", path }` | Open a test run's folder, or a folder inside one, in the desktop's file manager. Only an existing folder whose real path, links resolved, lies inside a test run's folder is opened: a file, a missing path, a path that climbs out with `..`, and a link pointing out of the run are refused. The result is `{ opened: path }` |
| backend to client | `{ id, type: "result", result }` | The answer to a request. For `collection.read`, `result` is the collection view |
| backend to client | `{ id?, type: "refused", reason }` | A frame that is not JSON, fails its schema or has an unknown `type`, or a request that failed. The `id` is there when one could be read. Also pushed unasked, without an `id`, when a re-read after a change on disk fails, such as the folder being deleted. The socket stays open |
| backend to client | `{ type: "collection", collection }` | A file the collection reads changed on disk, whoever changed it. The whole view is sent again |
| backend to client | `{ type: "test.changed", run, state }` | A test run changed: a visit opened or reported, an event came in, or the run settled. `state` is `{ folder, lineId, status, ending?, visits, actions }`, with `status` one of `running`, `waiting` and `settled`; `actions` lists, by visit id, what each visit waiting for a person offers. A request naming a run the studio does not have is refused with `there is no test run <id>` |
| backend to client | `{ type: "run.output", run, line: { stream, text } }` | One line a run wrote, on `stdout` or `stderr`, sent to every socket |
| backend to client | `{ type: "run.ended", run, exitCode, error?, outcome?, costUsd?, durationMs?, produced?, edge? }` | A run ended. `exitCode` is `null` when it was cancelled, and then the rest is absent. It is also `null` when the agent's program could not be started, and then `error` says why. Otherwise `outcome` is the agent's verdict, `produced` lists each file produce as `{ name, found }`, and `edge` is the `{ from, to, on }` the outcome takes (none from a terminal node). `costUsd` and `durationMs` are what the agent's final `result` line states as `total_cost_usd` and `duration_ms`. Each is absent unless the agent stated it as a finite number of zero or more, so an unstated cost is never read as zero |

A new request type is one schema in `src/protocol.ts` and one handler in the table in `src/backend/requests.ts`.

### The collection view

`collectionView(files, hostKeys)` is pure and takes `{ path, text }` values. It answers plain JSON: `lines`, `agents`, `refused` and `counts`. The backend adds `folder`, the name of the collection's folder, to what it sends. A node that names a `fanout` carries it as `fanout: { over, to }`. The types are in `src/view.ts` and exported from the protocol.

- An assembly line with problems is still shown. Each assembly line is read on its own, so one the collection's overlay would refuse appears with `problems` listing each one: `rule`, the `node` when there is one, and the `message`. The rules of the lint and the floor's own check of a line body are both there. A fault they both name is listed once, as the lint's rule.
- A file that cannot be read at all is in `refused` with its path and the reason. Examples are YAML that does not parse, an agent file with no frontmatter, or a `pipeline.yaml` beside an `assembly-line.yaml`. The other files still draw.
- Settings are shown as the file writes them. `${NAME}` is not filled from the environment.
- Each node holds its station's `kind`, `description`, `outcomes`, `needs` and `produces`. Each need has its `coverage` from `needCoverage`. Each produce has `readBy`, the nodes downstream of it (by `downstreamOf`) whose station needs it. The node has its `events` from `nodeEvents`. For an agent station whose agent a file defines, it also has `agent` and the `placeholders` of that agent's prompt from `promptPlaceholders`.

## Security

The backend writes files and starts processes, so no web page may reach it. Three rules keep it shut.

- It listens on `127.0.0.1` and never on `0.0.0.0`.
- A random token of 256 bits is made at start. A socket is accepted only when its url carries `?token=<token>`, compared in constant time. Without it the upgrade is refused with 401.
- A browser always sends an `Origin`. A socket that has one is accepted only when it is in the `origins` list given to `startStudio`. The shell passes the origin of its own page, as `127.0.0.1` and as `localhost` on the same port. Any other origin is refused with 403, whatever the token. A client that sends no `Origin` is not a browser, and the token is enough.

A refused upgrade gets no socket at all.

## Change watching

The backend watches `dir` with `fs.watch` and `recursive: true`. It ignores a path the collection does not read and anything under a dot folder. It waits about 100 ms for the changes to settle, then pushes one `collection` frame to every open socket, or one `refused` frame without an `id` when the read fails. A file that is deleted or renamed is handled the same way. A watcher error does not stop the backend.
