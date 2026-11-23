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
| `--host-key <name>` | a frontmatter key the host owns, accepted in an agent file and left out of its settings. As often as needed |
| `--no-open` | print the url and do not open a browser. Without it the default browser is opened with `xdg-open`, `open` or `start`; failing to open one is not an error |
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

The page keeps the selected line and node in the same fragment (`&line=<id>&node=<id>&tab=<tab>`), so a reload keeps the place. Choosing another node keeps the tab (the first tab when that node lacks it); Escape clears the node and the tab. A `collection` push redraws it in place and keeps the selection while the line and node still exist. Its screens: no address, connecting, cannot connect (it retries with backoff and reads the collection again once it is back), refused (a wrong token, or another protocol version, is not retried), unreadable (the collection could not be read, with the reason; an unasked `refused` push, such as the folder being deleted, replaces a collection already drawn), an empty folder, and the line view. The right-hand inspector shows the selected node's id and station, with tabs by kind (the arrow keys move between them and wrap, Home and End go to the first and last): none for a marker, Station and Events for a station, plus Prompt and Settings for an agent. The Station tab shows the description, each need with a sentence on how it is covered, each produce with the downstream nodes that read it, and the outcomes. The Events tab lists what starts the node (an edge, an outside event, or the line's own start, with its condition), the outside events that answer it with the outcome each reports, and what it raises: its events, each outcome with the node the edge it takes starts (or that the run stops there), and the lines a settled run starts. The Prompt tab shows the agent's prompt with each `{placeholder}` marked by its state (by the same name rule the lint uses, `placeholderPattern`), a table of the placeholders with their source, state and the nodes that fill them, and the needs the prompt never uses. The Settings tab lists each setting the agent file writes, as `key: value`, with objects and lists as compact JSON.

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
| backend to client | `{ id, type: "result", result }` | the answer to a request. For `collection.read`, `result` is the collection view |
| backend to client | `{ id?, type: "refused", reason }` | a frame that is not JSON, fails its schema, or has an unknown `type`, or a request that failed. The `id` is there when one could be read. Also pushed unasked, without an `id`, when a re-read after a change on disk fails, such as the folder being deleted. The socket stays open |
| backend to client | `{ type: "collection", collection }` | a file the collection reads changed on disk, whoever changed it: the whole view again |

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
