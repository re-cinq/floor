---
title: Fan-out
description: Run one step for each entry of a list and gather the results.
wordBudget: 150
sidebar:
  order: 3
---

Use this when a station produces a list and each entry needs the same work.

<!-- generated:example:cookbook/fan-out/assembly-line.yaml -->

````yaml title="fan-out/assembly-line.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: fan-out
  entry: split
  exit: done
  fail: stopped
  start:
    on:
      - document.received
    args:
      document: "{document}"
  args:
    document:
      kind: value
      subject: true
  nodes:
    - id: split
      station: list-sections
      fanout:
        over: sections
        to: summarize
    - id: summarize
      station: summarize-section
    - id: combine
      station: join-summaries
    - id: done
    - id: stopped
  edges:
    - from: split
      to: summarize
      on: success
    - from: split
      to: stopped
      on: failed
    - from: summarize
      to: combine
      on: success
    - from: summarize
      to: stopped
      on: failed
    - from: combine
      to: done
      on: success
    - from: combine
      to: stopped
      on: failed
stations:
  list-sections:
    description: A worker of yours lists the sections of the document as a JSON array of strings.
    kind: service
    outcomes:
      - success
      - failed
    needs:
      - name: document
        kind: value
    produces:
      - name: sections
        kind: value
  summarize-section:
    description: An agent summarizes one section. It runs once for each entry of the list.
    kind: agent
    agent_definition: section-summarizer
    outcomes:
      - success
      - failed
    result_required: true
    needs:
      - name: item
        kind: value
    produces:
      - name: summary
        kind: value
  join-summaries:
    description: A worker of yours joins the summaries of every section.
    kind: service
    outcomes:
      - success
      - failed
    needs:
      - name: summaries
        kind: value
        collect: summary
    produces:
      - name: digest
        kind: value
````

<!-- /generated -->

<!-- generated:example:cookbook/fan-out/agents/section-summarizer.md -->

````markdown title="fan-out/agents/section-summarizer.md"
---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
---
Summarize this section in one sentence: {item}

End your reply with this line on its own, with your sentence as the summary:

LORE_NODE_RESULT: {"outcome": "success", "produced": {"summary": "<your sentence>"}}
````

<!-- /generated -->

## How it works

1. `list-sections` produces `sections`, a JSON array of strings.
2. `fanout` on the `split` node names that value in `over` and the body node in `to`.
3. The body station lists `item` in its `needs`, and each branch gets one entry.
4. Each branch produces `summary`.
5. `join-summaries` needs `summaries` with `collect: summary`, which is a JSON array of every branch's `summary` in list order.

See [Fan-out](/floor/specs/run-semantics/#6-fan-out) and [Rules of a fan-out](/floor/specs/pipeline-file/#6-rules-of-a-fan-out).
