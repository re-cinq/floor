---
title: The bag
description: How data moves between the stations of an assembly run.
wordBudget: 600
sidebar:
  order: 6
---

The bag is the set of named items one [assembly run](/floor/concepts/assembly-run/) has collected. A [station](/floor/concepts/station/) is given its needs from the bag and writes what it produces back to it. That is the only way data moves between stations.

## An item

Each item has a name and four fields.

| Field | Holds |
| --- | --- |
| `kind` | `value`, `file` or `git` |
| `ref` | For `value`, the text. For `file`, the hash of the stored file. For `git`, `host/owner/name@branch`. |
| `by` | Who put the item in the bag. The name of the event that started the run, `line` for one of the line's files, or the id of the visit that produced it. |
| `sha` | `git` only. What the branch pointed at when the item was written. |

## What fills the bag

1. The line's `args` fill it at the start, one item per argument.
2. The line's `files` fill it at the start with fixed files.
3. A station's `produces` fill it each time one of its visits reports.

## How a station reads it

A station lists what it takes in `needs`. A need is filled from the item of the same name. A need with `optional: true` is left empty when the bag has no such item. When the bag holds the item under another name, the node's `bind` maps the need to it:

```yaml
- id: publish
  station: publish-note
  bind: { note: draft }
```

## The bag only grows

A later item of the same name replaces the earlier one. Nothing is removed. A need keeps the item it was given when its visit opened, even if a later visit replaces that item.

## One run, step by step

The line `write-note` starts on the event `note.requested`. Its station `write-note` needs `topic` and produces the file `note`. Its station `publish-note` needs `note` and produces `note_url`.

After the event `note.requested` with the payload `{"topic": "floors"}`, `by` is the name of the event:

```json
{ "topic": { "kind": "value", "ref": "floors", "by": "note.requested" } }
```

After the visit of `write` reports, `by` is the id of that visit and `ref` is the hash of the file:

```json
{
  "topic": { "kind": "value", "ref": "floors", "by": "note.requested" },
  "note": { "kind": "file", "ref": "sha256-9f2c41d0...", "by": "0b6f4c1e-8a57-4a3c-9d2e-5f1c7a9b3e10" }
}
```

After the visit of `publish` reports:

```json
{
  "topic": { "kind": "value", "ref": "floors", "by": "note.requested" },
  "note": { "kind": "file", "ref": "sha256-9f2c41d0...", "by": "0b6f4c1e-8a57-4a3c-9d2e-5f1c7a9b3e10" },
  "note_url": { "kind": "value", "ref": "https://notes.example/42", "by": "5d3a9e07-61c2-4b8f-a0d4-7e2b1c8f9a35" }
}
```

## Names the floor fills

These are not in the bag. An agent's prompt uses them as [placeholders](/floor/specs/placeholders/#2-prompt-placeholders).

- `previous_error` is the error of the last failed visit at the node.
- `previous_failures` is the errors of up to three failed visits at the node.
- `item` is the entry a branch of a fan-out runs for.

## Collecting a fan-out

A need with `collect: <name>` is filled with a JSON array of what each branch of a fan-out produced under that name, in branch order. See [Fan-out](/floor/specs/run-semantics/#6-fan-out).

## Look at a run's bag

The `bag` key of a run holds its items, as shown above.

```sh
curl -H "authorization: Bearer $FLOOR_SERVICE_TOKEN" http://localhost:8180/assembly-runs/<run id>
```

## What floor checks

Floor refuses a line in which a required need can be empty. The rules are in [Rules of the bag](/floor/specs/pipeline-file/#5-rules-of-the-bag).
