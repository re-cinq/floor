# Agent definition

**The settings an agent runs with: model, prompt, timeout, image, tags.** A
station of the agent kind references one; a visit records which version it
used.

Not the ai-agent-subsystem's `AgentDefinition`, which is a recipe resource
inside a cluster. The cluster agent builds one of those from this.

## Why it is separate from the station

A station says what work is done; an agent definition says how the model is
configured to do it.

- one prompt fix does not re-version every station and line that uses it
- a repo can override the model, the prompt, or where its pods run, through
  a **variant**, without touching the station
- lore's per-repo overrides (project row, then org default, per field) are
  exactly a variant

## Fields

| field | meaning |
|---|---|
| `name` | the id a station points at |
| `settings.model` | e.g. `claude-sonnet-4-6`, `gemini-3.1-pro-preview` |
| `settings.prompt` | the prompt template; `{placeholders}` name the station's needs |
| `settings.timeout_minutes` | the work budget of a visit |
| `settings.image` | the execution image |
| `settings.tags` | which cluster agents may run it; a claimer must offer all of them |
| `settings.config` | open object, checked when the definition is put. Read today, under lore's names: `skills`, `skills_source`, `mcp_servers`, `disallowed_tools`, `env`, `permission_mode` (`bypass` when absent), `max_turns`, `model_secret_key`. Anything else is kept and unused. Not built yet: `pod_resources`, `command`, `workdir` |
| `variants` | `host/owner/name` → partial settings merged over the defaults, per field, and per key inside `config` |

The model's API key is not here. The floor names a model; the cluster agent
owns the secret for that model family, in its own cluster. A definition
with no `model` gets no secret at all, since the family is read from the
model's name.

## Skills and MCP servers

Both are the agent's, so both are declared here, in `config`, and a repo's
variant may replace either.

```yaml
config:
  skills: [lore-context]
  skills_source: http://lore-mcp-gateway.lore-api.svc.cluster.local:8080/skills
  mcp_servers:
    - { name: lore, transport: http, url: "http://lore-mcp-gateway.lore-api.svc.cluster.local:8080/mcp", headers_secret: lore-mcp-auth }
    - { name: files, transport: stdio, command: npx, args: ["-y", "@modelcontextprotocol/server-filesystem"] }
```

- **`skills_source`** is where the pod fetches each named skill, and the
  agent's `settings.json`, hooks included. With none, the floor's own
  `/skills` is used, which serves empty settings and no skills.
- **`headers_secret`** names a key in the cluster's `agent-secrets`, holding
  the header whole: `Authorization: Bearer <token>`. The pod's reference to
  it is not optional. A key that is not there is a pod that never starts.
- **A url is a fact about one environment.** The address above is a
  cluster's; on a laptop the same gateway is at `host.minikube.internal`.
  A variant is keyed by repo, not by environment, so a definition naming a
  url works in one place.

## Example, from lore

```yaml
name: reviewer
settings:
  model: gemini-3.1-pro-preview
  prompt: |
    Review the diff on {pr_url} against the spec. Emit REVIEW_FINDINGS as JSON
    and one REVIEW_RESULT line: success or changes_requested.
    {previous_error}
  timeout_minutes: 20
  image: ghcr.io/re-cinq/lore-station:1.4
  tags: []
variants:
  github.com/re-cinq/lore:
    model: claude-sonnet-4-6          # this repo wants the sonnet reviewer
  github.com/acme/secret-project:
    tags: [cluster:acme]              # this repo's pods run in acme's own cluster
```

## Workflow: resolution at visit open

1. The station version names `reviewer`.
2. The store takes the latest `reviewer` version.
3. The run's repo selects its variant, merged over the defaults per field.
4. The deadline is `now + queue_wait + timeout_minutes`.
5. The dispatch event carries `kind:agent` plus the resolved `tags`.
6. The visit records the agent definition hash. Reading the visit later
   shows exactly what ran.
