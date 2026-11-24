# @re-cinq/floor-studio

A local studio for a collection of assembly lines: the folder with one folder a line, each holding `assembly-line.yaml` and `agents/<agent>.md`. It reads the folder, draws nothing itself, and tells every client what the collection holds: each assembly line with its nodes, edges and problems, each agent with its settings and prompt, and each file it refused and why. A change to a file on disk reaches every client at once.

This package is the backend, the protocol, the command that starts them, and the page that draws the lines (`web/`). It is not published to npm yet: run it from a checkout.

## The three parts

| part | where | what it does |
|---|---|---|
| Backend | `src/backend`, exported as `@re-cinq/floor-studio/backend` | headless. `startStudio({ dir, port, hostKeys, origins })` listens on `127.0.0.1` and speaks WebSocket only. It serves no page and knows nothing about a browser |
| Protocol | `src/protocol.ts`, exported as `@re-cinq/floor-studio/protocol` | every frame as a zod schema and its type. It imports nothing from Node, so a browser bundle can take it |
| Shell | `src/cli.ts`, the command `floor-studio` | parses the arguments, starts the backend, serves the built page from `dist/web` over plain HTTP on `127.0.0.1`, and opens the browser. A desktop app would replace only this part |
| Page | `web/`, built into `dist/web` | a Vite and React app, one client of the backend. It takes the socket and the token from its address and draws the collection |

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
| `dir` | the collection. Default: the current directory. A directory that does not exist is an error, exit 1 |
| `--port <n>` | the port of the backend's socket on `127.0.0.1`. Default: a free one. The page's own port is always a free one |
| `--host-key <name>` | a frontmatter key the host owns, accepted in an agent file and left out of its settings. As often as needed. The `host_keys` of the collection's `floor-collection.yaml` count too, read again when that file changes |
| `--no-open` | print the url and do not open a browser. Without it the studio waits 3 seconds and opens the default browser with `xdg-open`, `open` or `start`, unless a page has connected by then, such as a tab left open from before a restart; failing to open one is not an error |
| `--help` | print the usage and exit 0. A bad argument prints the usage to standard error and exits 2 |

It prints one line, `floor-studio: <url>`. The url is the page's, and carries what the page needs in its fragment, which a browser does not send to a server:

```
http://127.0.0.1:<page port>/#socket=ws%3A%2F%2F127.0.0.1%3A<socket port>&token=<token>
```

When `dist/web` does not exist the page server answers a plain page saying the page is not built. It serves only files under `dist/web`, with `Cache-Control: no-store`, and refuses a path that leaves the folder, by `..`, by a percent-encoded `..` or by a symlink.

## The page

`web/` holds the page: Vite, React and TypeScript, styled with plain CSS custom properties and CSS Modules in lore's look (tokens in `web/src/theme/theme.css`, IBM Plex Sans and JetBrains Mono as local files, light, dark or auto). It draws the assembly lines with lore's graph code (`web/src/graph`, where its README says what was copied and stripped), and loads nothing from another host. Everything it needs is bundled, so React, Vite and the test tools are devDependencies and the published package needs none of them at run time.

| where | what |
|---|---|
| `npm run build -w @re-cinq/floor-studio` | `tsc` writes `dist` except `dist/web`, then `vite build` writes only `dist/web` (it empties that folder and nothing else), so the two steps do not depend on their order |
| `dist/web/index.html` | the built page, the one the command serves |
| `npm run dev:web -w @re-cinq/floor-studio` | the Vite dev server with hot reload |
| `npm run typecheck -w @re-cinq/floor-studio` | checks `src` and `web` |

To work on the page, start a backend and give the dev server its address:

```
node packages/studio/dist/cli.js path/to/collection --no-open     # prints floor-studio: http://127.0.0.1:<page port>/#socket=...&token=...
npm run dev:web -w @re-cinq/floor-studio                           # serves http://localhost:5173/
```

Open `http://localhost:5173/` with the fragment the command printed (`#socket=...&token=...`). The backend refuses a browser page whose origin it was not told, so start it with the dev server's origin allowed by calling `startStudio({ ..., origins: ["http://localhost:5173"] })` from a script; the command itself allows only its own page, as `127.0.0.1` or `localhost` on the page's port.

The page keeps the selected line and node in the same fragment (`&line=<id>&node=<id>&tab=<tab>`), so a reload keeps the place. Clicking a graph line or its label selects that line instead (`&edge=<from>|<to>|<event>`, the node dropped), and a Line inspector shows its stations, event, whether it is on the main path and its iteration limit. Choosing another node keeps the tab (the first tab when that node lacks it); Escape clears the node and the tab. A `collection` push redraws it in place and keeps the selection while the line and node still exist. Its screens: no address, connecting, cannot connect (it retries with backoff and reads the collection again once it is back), refused (a wrong token, or another protocol version, is not retried), unreadable (the collection could not be read, with the reason; an unasked `refused` push, such as the folder being deleted, replaces a collection already drawn), an empty folder, and the line view. The right-hand inspector shows the selected node's id and station, with tabs by kind (the arrow keys move between them and wrap, Home and End go to the first and last): none for a marker, Station and Events for a station, plus Prompt, Run and the five settings tabs (Model, Tools, MCP, Pod, Other) for an agent. The Station tab shows the description, each need with a sentence on how it is covered, each produce with the downstream nodes that read it, and the outcomes. The Events tab lists what starts the node (an edge, an outside event, or the line's own start, with its condition), the outside events that answer it with the outcome each reports, and what it raises: its events, each outcome with the node the edge it takes starts (or that the run stops there), and the lines a settled run starts. The Prompt tab shows the agent's prompt with each `{placeholder}` marked by its state (by the same name rule the lint uses, `placeholderPattern`), a table of the placeholders with their source, state and the nodes that fill them, and the needs the prompt never uses. The settings tabs show each setting the agent file writes; without a studio connection it is a read-only `key: value` list, with objects and lists as compact JSON.

**Editing.** Connected to a studio, the Prompt tab has an editor and "Save prompt", and each settings tab a form (a field per setting, nested ones such as `config` as YAML) and "Save settings". A save sends `agent.write` with the version of the file the edit started from; the backend refuses it when the file changed on disk since, or when the agent file it would write fails the same check the collection read uses, and the tab shows the reason. Numbers stay numbers. With no unsaved edits, a change on disk shows at once; with unsaved edits, the edits are kept and the tab offers "Take the version on disk" or "Keep my edits", and a save before choosing is refused. An agent extended by `<line>/agents/<agent>.extra.md` also gets an "Extra prompt" editor for that file's text on its own: the studio is told no shipped agents, so it shows no merged prompt and the collection still lists the extension as refused, but its text can be edited and saved, with the same version check.

### The inspector tabs

| tab | what it shows |
|---|---|
| Station | description, needs and their coverage, produces and readers, outcomes |
| Events | what starts the node, what answers it, what it raises |
| Prompt | the prompt, its placeholders, unused needs; an editor when connected |
| Run | runs this one station on your machine; see below |
| Model | `model`, `permission_mode`, `max_turns`, `model_secret_key` |
| Tools | `skills`, `skills_source`, `disallowed_tools` |
| MCP | `mcp_servers` |
| Pod | `image`, `timeout_minutes`, `env`, `pod_resources` |
| Other | `tags`, `prices` and the rest of `config` |

### Running one station

The Run tab of an agent node runs that station alone, with the agent CLI on your machine. It runs `claude` or `codex`, by the agent's model; any other family is a blocker.

- It has a field for each need: a value is text, a file is the path of a file to copy to the need's path in the folder, a git need is the path of a checkout to link at its path. A git need links the real checkout, so the agent's commits land in it.
- Folder is where it runs. Permission is `acceptEdits` or `bypass` (as in the pod).
- Preview shows the rendered prompt, the command and the blockers: a required need with no value, a source path that does not exist, or a model the studio cannot run. A run with blockers is refused.
- Run starts it and Cancel stops it. The transcript streams in as what the agent said, each tool it called (`› Read tests.json`), each refusal in red, and the run's turns, time and cost; Raw shows the lines as `claude` printed them. When it ends the tab shows the agent's final answer under Answer, its words as text and any JSON object in it laid out field by field (each list item a numbered block, the `LORE_NODE_RESULT` line left out), and then, each under its label, the outcome (the agent's verdict, read from its final result), the exit code (none when cancelled), each produce as found or missing (a produce `from: output` is found when the agent gave a final answer), the edge taken, and the events raised next. The edge is lit on the graph.
- The run gets the agent's `config.env` over the studio's own environment, so `CLAUDE_CODE_DISABLE_CLAUDE_MDS` and the like apply as in the pod.
- `/workspace` in the prompt's text, as the pod spells the working folder, is replaced by the picked folder, as it is in the `<name>_path` parameters.

The need values are saved in `.floor-studio/fixtures/<line>/<node>.json` and each run in `.floor-studio/runs/<id>.json`, both in the collection folder. The store folder gets a `.gitignore` of `*` on its first write. The run's id is kept in the page's fragment (`&run=<id>`), so after a reload the tab reads the transcript again with `run.read`, also for a run still going. Closing the studio cancels its runs.

### The environment

The sidebar lists the variables the settings name as `${NAME}`, with the files using each. A setting written that way shows as a chip, `env: NAME`; the studio does not fill it. Override opens the field to type a value in its place; saved with nothing typed, the setting keeps its `${NAME}`. The install that applies the collection fills it in once, and applying fails when it is not set. In Lore it is set on lore-api by its Helm chart, or in `.env.local` when Lore runs locally.

## Use the backend on its own

```ts
import { startStudio } from "@re-cinq/floor-studio/backend";

const studio = await startStudio({ dir: "collection", port: 0, hostKeys: ["review_required"], origins: [] });
// studio.url is ws://127.0.0.1:<port>; open it with ?token=<studio.token>
await studio.close();
```

`startStudio` resolves to `{ url, token, close }`. `url` has the real port and not the token. `close()` closes the sockets, the server and the watcher. It rejects when `dir` is not a directory.

## The protocol

Every frame is JSON in one WebSocket message. A request carries an `id` the client chooses and is answered by one `result` or `refused` frame with that `id`. The backend also pushes frames nobody asked for.

| direction | frame | when |
|---|---|---|
| backend to client | `{ type: "hello", version }` | first, when a socket opens. `version` is `PROTOCOL_VERSION` |
| client to backend | `{ id, type: "collection.read" }` | the client wants the whole collection |
| client to backend | `{ id, type: "agent.write", line, agent, prompt, settings?, version }` | rewrite an agent file: the body becomes `prompt`, the frontmatter `settings` when given (comments and key order kept); `version` is the sha256 of the file as the client read it (each node's `agent.version`). Refused when the line has no such agent, the file changed since, or the file it would write fails the agent-file check. The result is `{ written: <file> }` |
| client to backend | `{ id, type: "extra.write", line, agent, text, version }` | replace the whole text of the agent's `.extra.md` (each node's `extra`); `version` is the sha256 of the file as read. Refused when the line has no extra file for that agent or the file changed since. The text is saved ending in one newline. The result is `{ written: <file> }` |
| client to backend | `{ id, type: "fixture.write", line, node, needs }` | save the need values (`needs`, a text for each need name) of a node in `.floor-studio/fixtures/<line>/<node>.json`. The result is `{ written: <file> }` |
| client to backend | `{ id, type: "fixture.read", line, node }` | read the saved need values of a node. The result is `{ needs }`, empty when none were saved |
| client to backend | `{ id, type: "run.preview", line, node, fixture, folder, permission }` | what a run would do: the result is `{ prompt, command, copies, links, blockers }`. `permission` is `acceptEdits` or `bypass` |
| client to backend | `{ id, type: "run.start", line, node, fixture, folder, permission }` | start a run of an agent node. Refused when the preview has blockers. The result is `{ run }`, the run's id |
| client to backend | `{ id, type: "run.cancel", run }` | stop a running run. Refused when none runs under that id. The result is `{ cancelled: run }` |
| client to backend | `{ id, type: "run.read", run, after }` | the transcript of a run from line number `after` on, running or ended, also after a restart. The result is `{ lines, ended? }` |
| backend to client | `{ id, type: "result", result }` | the answer to a request. For `collection.read`, `result` is the collection view |
| backend to client | `{ id?, type: "refused", reason }` | a frame that is not JSON, fails its schema, or has an unknown `type`, or a request that failed. The `id` is there when one could be read. Also pushed unasked, without an `id`, when a re-read after a change on disk fails, such as the folder being deleted. The socket stays open |
| backend to client | `{ type: "collection", collection }` | a file the collection reads changed on disk, whoever changed it: the whole view again |
| backend to client | `{ type: "run.output", run, line: { stream, text } }` | one line a run wrote, on `stdout` or `stderr`, sent to every socket |
| backend to client | `{ type: "run.ended", run, exitCode, outcome?, produced?, edge? }` | a run ended. `exitCode` is `null` when it was cancelled, and then the rest is absent. Otherwise `outcome` is the agent's verdict, `produced` lists each file produce as `{ name, found }`, and `edge` is the `{ from, to, on }` the outcome takes (none from a terminal node) |

A new request type is one schema in `src/protocol.ts` and one handler in the table in `src/backend/requests.ts`.

### The collection view

`collectionView(files, hostKeys)` is pure and takes `{ path, text }` values. It answers plain JSON: `lines`, `agents`, `refused` and `counts`. The backend adds `folder`, the name of the collection's folder, to what it sends. A node that names a `fanout` carries it as `fanout: { over, to }`. Its types are in `src/view.ts` and exported from the protocol.

- A line with problems is still a line. It is read on its own, so a line the collection's overlay would refuse for its problems appears with `problems` listing each one: `rule`, the `node` when there is one, and the `message`. The rules of the lint and the floor's own check of a line body are both there, and a fault they both name is listed once, as the lint's rule.
- A file that cannot be read at all, such as YAML that does not parse, an agent file with no frontmatter, or a `pipeline.yaml` beside an `assembly-line.yaml`, is in `refused` with its path and the reason. The other files still draw.
- Settings are shown as the file writes them: `${NAME}` is not filled from the environment.
- Each node holds its station's `kind`, `description`, `outcomes`, `needs` and `produces`, each need with its `coverage` from `needCoverage`, each produce with `readBy`, the nodes downstream of it (by `downstreamOf`) whose station needs it, its `events` from `nodeEvents`, and, for an agent station whose agent a file defines, `agent` and the `placeholders` of that agent's prompt from `promptPlaceholders`.

## Security

The backend writes files and starts processes, so no web page may reach it. Three rules hold it shut.

- It listens on `127.0.0.1` and never on `0.0.0.0`.
- A random token of 256 bits is made at start. A socket is accepted only when its url carries `?token=<token>`, compared in constant time. Without it the upgrade is refused with 401.
- A browser always sends an `Origin`. A socket that has one is accepted only when it is in the `origins` list given to `startStudio`; the shell passes the origin of its own page, as `127.0.0.1` and as `localhost` on the same port. Any other origin is refused with 403, whatever the token. A client that sends no `Origin` is not a browser, and the token is enough.

A refused upgrade gets no socket at all.

## Change watching

The backend watches `dir` with `fs.watch` and `recursive: true`. It ignores a path the collection does not read and anything under a dot folder, waits about 100 ms for the changes to settle, then pushes one `collection` frame to every open socket, or one `refused` frame without an `id` when the read fails. A file that is deleted or renamed is handled the same way. A watcher error does not stop the backend.
