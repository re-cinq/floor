---
title: Agent file
description: The markdown file that defines an agent in a collection, its settings in the frontmatter and its prompt in the body.
sidebar:
  order: 2
---

An agent file is a markdown file in a [collection](/floor/specs/collection/). Its frontmatter holds the agent's settings and its body is the agent's prompt.

The words MUST, MUST NOT, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

A JSON Schema of the frontmatter is at [`/floor/schemas/agent.schema.json`](/floor/schemas/agent.schema.json).

## 1. The file

1. The file is named `<agent>.md`. The agent's id is the file name without `.md`.
2. The file MUST start with a line of `---`, then YAML, then a line of `---`. Without it the file is refused with `<agent>.md: missing the --- frontmatter block`.
3. Lines MUST end with a line feed. A file with Windows line endings or a byte order mark is refused with the same message.
4. Everything after the closing `---` line is the prompt, kept as written.

## 2. Frontmatter

<!-- generated:fields:agent -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `model` | string | no | The model the agent runs on. |
| `image` | string | no | The container image the agent runs in. Required in a file that defines an agent. |
| `timeout_minutes` | integer above 0 | no | How long a visit may run, in minutes. Required in a file that defines an agent. |
| `tags` | list of string | no | Which cluster agents may run it. A cluster agent claims a visit only when it offers every tag. |
| `prices` | map of object | no | Model name to what it costs, for a model that reports tokens and no cost. |
| `config` | map of anything | no | Settings for the agent's pod. A key the floor does not know is kept and not acted on. |

<!-- /generated -->

1. A key not in this table MUST NOT appear. The file is refused with `<agent>.md: ✖ Unrecognized key: "<key>"`.
2. `image`, `timeout_minutes` and a prompt that is not empty are REQUIRED. The file is refused with `<agent> has no <field>, and a full agent definition needs a prompt, an image and timeout_minutes`.
3. A string value MAY name an environment variable as `${NAME}`. See [Placeholders](/floor/specs/placeholders/#3-environment-variables).
4. A host MAY accept keys of its own. A collection names them in `floor-collection.yaml` at its root, as `host_keys: [execution_mode, review_required]`; `floor-pipeline` and `floor-studio` also take each as `--host-key <name>`, and use both. The floor never reads them.

### 2.1 Prices

Each entry of `prices` is the price of one model, by its name.

<!-- generated:fields:price -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `input_per_million` | number | yes | US dollars for a million input tokens. |
| `output_per_million` | number | yes | US dollars for a million output tokens. |
| `cache_read_per_million` | number | no | US dollars for a million tokens read from the cache. The input price when not stated. |
| `cache_write_per_million` | number | no | US dollars for a million tokens written to the cache. The input price when not stated. |

<!-- /generated -->

### 2.2 Config

<!-- generated:fields:config -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `skills` | list of string | no | Names of the skills the agent is given. |
| `skills_source` | URL | no | Where the pod fetches each named skill and the agent's settings. Defaults to the floor's own `/skills`, which serves no skills. |
| `mcp_servers` | list of object | no | The MCP servers the agent can call. |
| `disallowed_tools` | list of string | no | Tools the agent may not use. |
| `env` | map of string | no | Environment variables of the agent, as plain values. |
| `permission_mode` | `auto` or `bypass` | no | How the agent asks before it acts. Defaults to `bypass`. |
| `max_turns` | integer above 0 | no | The most turns the agent takes in one visit. |
| `model_secret_key` | string | no | The key of `agent-secrets` that holds the model's API key. |
| `pod_resources` | object | no | The resources of the agent's container. With none, the cluster's default applies. |

<!-- /generated -->

An entry of `mcp_servers`:

<!-- generated:fields:mcp-server -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The name the agent knows the server by. |
| `transport` | `stdio`, `http` or `sse` | yes | How the server is reached. `stdio` is a process the pod starts. `http` and `sse` are an address it calls. |
| `command` | string | no | `stdio` only, and required there. The command that starts the server. |
| `args` | list of string | no | `stdio` only. The command's arguments. |
| `url` | URL | no | `http` and `sse` only, and required there. The server's address. |
| `headers_secret` | string | no | The key of `agent-secrets` that holds one whole header line, such as `Authorization: Bearer <token>`. |
| `headers` | list of object | no | `http` and `sse` only. Headers sent to the server, each valued from `agent-secrets`. |
| `env` | list of object | no | `stdio` only. Environment variables of the server's process, each valued from `agent-secrets`. |

<!-- /generated -->

A `stdio` server MUST have a `command`, and any other a `url`. The floor says `a stdio server needs a command, any other a url`.

An entry of `headers` or of a server's `env`:

<!-- generated:fields:secret-ref -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The name of the header or environment variable. |
| `ref` | string | yes | The key of the cluster's `agent-secrets` that holds its value. |

<!-- /generated -->

`pod_resources`:

<!-- generated:fields:pod-resources -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `requests` | object | no | What the pod asks for. |
| `limits` | object | no | What the pod may not exceed. |

<!-- /generated -->

`requests` and `limits` each take:

<!-- generated:fields:resource-quantities -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `cpu` | string | no | A Kubernetes quantity, such as `500m`. |
| `memory` | string | no | A Kubernetes quantity, such as `2Gi`. |
| `ephemeral-storage` | string | no | A Kubernetes quantity, such as `6Gi`. |

<!-- /generated -->

## 3. The prompt

The prompt is plain text. `{name}` in it is filled when a visit opens, as described in [Placeholders](/floor/specs/placeholders/#2-prompt-placeholders).

An agent says how its visit ended on a line of its own in its last reply.

| The agent's last reply has | The visit's outcome |
| --- | --- |
| A line `LORE_NODE_RESULT: <outcome>`, where the outcome is one the station lists, or `failed` | That outcome |
| A line `LORE_NODE_RESULT: {"outcome": "<outcome>", "produced": {"<name>": "<text>"}}` | That outcome, and each named `value` the station produces |
| A `LORE_NODE_RESULT:` line with anything else | `failed` |
| No such line, and `REVIEW_RESULT: CHANGES_REQUESTED` | `changes_requested` |
| No such line, and `REVIEW_RESULT: APPROVED` | `success` |
| None of these | `success`, or `failed` when the station sets `result_required` |

Every value of `produced` MUST be text. A list for a fan-out is a JSON array written as text, such as `"topics": "[\"billing\", \"search\"]"`.

The last `LORE_NODE_RESULT:` line wins. The line MUST start with it, so a prompt can mention the marker inside a sentence.

## 4. Extensions

A file named `<agent>.extra.md` adds to an agent the host ships.

1. It has no frontmatter. The whole file is text.
2. Its text is added to the end of the shipped agent's prompt, after an empty line.
3. The host MUST ship an agent of that name. If not, the file is refused with `an extension needs a shipped agent, and nothing ships <agent>`.
4. An agent MUST NOT have both `<agent>.md` and `<agent>.extra.md` in one collection. The extension is refused with `<agent> is already set by <path>`.

## 5. Example

<!-- generated:example:starter/write-note/agents/note-writer.md -->

````markdown title="write-note/agents/note-writer.md"
---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
config:
  max_turns: 10
---
Write one short sentence about {topic} into the file {note_path}. Do nothing else.

When the file is written, end your reply with this line on its own:

LORE_NODE_RESULT: success
````

<!-- /generated -->

## 6. Limits

- `config` is checked by the floor when the collection is applied, not by `floor-pipeline lint`. A `pod_resources` value that is not a Kubernetes quantity passes lint and is refused on apply.
- An agent file cannot set repository variants. They are set on the floor with `PUT /agent-definitions/{id}`, and applying a collection keeps them.
