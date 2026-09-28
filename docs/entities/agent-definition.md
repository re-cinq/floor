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
| `settings.config` | open object passed through to the subsystem. Read today: `skills`, `disallowed_tools`, `env`, `permission_mode` (`bypass` when absent), `max_turns`, `model_secret_key`. Not built yet: `pod_resources`, `command`, `workdir` |
| `variants` | `host/owner/name` → partial settings merged over the defaults, per field, and per key inside `config` |

The model's API key is not here. The floor names a model; the cluster agent
owns the secret for that model family, in its own cluster. A definition
with no `model` gets no secret at all, since the family is read from the
model's name.

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
