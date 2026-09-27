# Agent definition

**The settings an agent runs with: model, prompt, timeout, image.** A
station references one; a visit records which version and variant it used.

## Why it is separate from the station

A station says what work is done; an agent definition says how the LLM is
configured to do it. Splitting them means:

- one prompt fix does not re-version every station and line that uses it
- a repo can override the model or prompt for *its* runs without touching
  the station, through a **variant**
- lore's existing per-repo overrides (project row then org default) map onto
  variants one to one

## Fields

| field | meaning |
|---|---|
| `name` | the id a station points at |
| `settings.model` | e.g. `claude-sonnet-4-6`, `gemini-3.1-pro-preview` |
| `settings.prompt` | the prompt template; may reference the station's needs by name |
| `settings.timeout_minutes` | the visit's deadline |
| `settings.image` | agent kind: the execution image |
| `settings.config` | open object passed through to the wrapper: `skills`, `pod_resources`, `disallowed_tools`, `env`, `command`, `workdir` |
| `variants` | `host/owner/name` → partial settings merged over the defaults, per field, and per key inside `config` |

Versioned by content hash, like stations and lines.

## Example, from lore

Lore's `implementation.yaml` uses prompt `review` on model
`gemini-3.1-pro-preview`, and lore's project rows let a repo override the
model. As an agent definition:

```yaml
name: reviewer
settings:
  model: gemini-3.1-pro-preview
  prompt: |
    Review the diff on {pr_url} against the spec. Emit REVIEW_FINDINGS as JSON
    and one REVIEW_RESULT line: success or changes_requested.
  timeout_minutes: 20
  image: ghcr.io/re-cinq/lore-station:1.4
variants:
  github.com/re-cinq/lore:
    model: claude-sonnet-4-6          # this repo wants the sonnet reviewer
```

## Workflow: resolution at visit open

1. The station version names `reviewer`.
2. The store takes the latest `reviewer` version.
3. The run's repo is `github.com/re-cinq/lore`, so the variant is merged
   over the defaults: model becomes sonnet, everything else stays.
4. The prompt is rendered against the visit's needs and frozen in the brief.
5. The visit records the agent definition hash. Reading the visit later shows
   exactly what ran.
