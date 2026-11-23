# @re-cinq/floor-studio

A local studio for a collection of assembly lines: the folder with one folder a line, each holding `assembly-line.yaml` and `agents/<agent>.md`. It reads the folder, draws nothing itself, and tells every client what the collection holds: each assembly line with its nodes, edges and problems, each agent with its settings and prompt, and each file it refused and why. A change to a file on disk reaches every client at once.

This package is the backend, the protocol and the command that starts them. The page that draws the lines is built separately and is not part of this version. It is not published to npm yet: run it from a checkout.

## The three parts

| part | where | what it does |
|---|---|---|
| Backend | `src/backend`, exported as `@re-cinq/floor-studio/backend` | headless. `startStudio({ dir, port, hostKeys, origins })` listens on `127.0.0.1` and speaks WebSocket only. It serves no page and knows nothing about a browser |
| Protocol | `src/protocol.ts`, exported as `@re-cinq/floor-studio/protocol` | every frame as a zod schema and its type. It imports nothing from Node, so a browser bundle can take it |
| Shell | `src/cli.ts`, the command `floor-studio` | parses the arguments, starts the backend, serves the built page from `dist/web` over plain HTTP on `127.0.0.1`, and opens the browser. A desktop app would replace only this part |

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
| backend to client | `{ id?, type: "refused", reason }` | a frame that is not JSON, fails its schema, or has an unknown `type`, or a request that failed. The `id` is there when one could be read. The socket stays open |
| backend to client | `{ type: "collection", collection }` | a file the collection reads changed on disk, whoever changed it: the whole view again |

A new request type is one schema in `src/protocol.ts` and one handler in the table in `src/backend/requests.ts`.

### The collection view

`collectionView(files, hostKeys)` is pure and takes `{ path, text }` values. It answers plain JSON: `lines`, `agents`, `refused` and `counts`. Its types are in `src/view.ts` and exported from the protocol.

- A line with problems is still a line. It is read on its own, so a line the collection's overlay would refuse for its problems appears with `problems` listing each one: `rule`, the `node` when there is one, and the `message`. The rules of the lint and the floor's own check of a line body are both there, and a fault they both name is listed once, as the lint's rule.
- A file that cannot be read at all, such as YAML that does not parse, an agent file with no frontmatter, or a `pipeline.yaml` beside an `assembly-line.yaml`, is in `refused` with its path and the reason. The other files still draw.
- Settings are shown as the file writes them: `${NAME}` is not filled from the environment.
- Each node holds its station's `kind`, `description`, `outcomes`, `needs` and `produces`, its `events` from `nodeEvents`, and, for an agent station whose agent a file defines, `agent` and the `placeholders` of that agent's prompt from `promptPlaceholders`.

## Security

The backend writes files and starts processes, so no web page may reach it. Three rules hold it shut.

- It listens on `127.0.0.1` and never on `0.0.0.0`.
- A random token of 256 bits is made at start. A socket is accepted only when its url carries `?token=<token>`, compared in constant time. Without it the upgrade is refused with 401.
- A browser always sends an `Origin`. A socket that has one is accepted only when it is in the `origins` list given to `startStudio`; the shell passes the origin of its own page. Any other origin is refused with 403, whatever the token. A client that sends no `Origin` is not a browser, and the token is enough.

A refused upgrade gets no socket at all.

## Change watching

The backend watches `dir` with `fs.watch` and `recursive: true`. It ignores a path the collection does not read and anything under a dot folder, waits about 100 ms for the changes to settle, then pushes one `collection` frame to every open socket. A file that is deleted or renamed is handled the same way. A watcher error does not stop the backend.
