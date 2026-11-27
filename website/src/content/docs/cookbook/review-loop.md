---
title: Review loop
description: An agent drafts, a person approves or asks for changes, and the revision is briefed with the exact reason.
wordBudget: 170
sidebar:
  order: 6
---

Use this when an agent's work needs a person's sign-off, and a rejection should reach the agent word for word.

<!-- generated:example:cookbook/review-loop/assembly-line.yaml -->

````yaml title="review-loop/assembly-line.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: review-loop
  entry: write
  exit: done
  fail: abandoned
  args:
    topic:
      kind: value
      subject: true
  nodes:
    - id: write
      station: draft-writer
      bind:
        feedback: review_feedback
    - id: review
      station: reviewer
    - id: done
    - id: abandoned
  edges:
    - from: write
      to: review
      on: success
    - from: write
      to: abandoned
      on: failed
    - from: review
      to: done
      on: approved
    - from: review
      to: write
      on: changes_requested
      iteration_max: 3
stations:
  draft-writer:
    description: An agent drafts a short text about the topic and addresses the reviewer's feedback.
    kind: agent
    agent_definition: draft-writer
    outcomes:
      - success
      - failed
    needs:
      - name: topic
        kind: value
      - name: feedback
        kind: value
        optional: true
        fresh: true
    produces:
      - name: draft
        kind: file
        path: draft.md
  reviewer:
    description: A person reads the draft and approves it or asks for changes.
    kind: human
    outcomes:
      - approved
      - changes_requested
    needs:
      - name: draft
        kind: file
    produces:
      - name: review_feedback
        kind: value
````

<!-- /generated -->

<!-- generated:example:cookbook/review-loop/agents/draft-writer.md -->

````markdown title="review-loop/agents/draft-writer.md"
---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
config:
  max_turns: 10
---
Write a short draft about {topic} into the file {draft_path}.

If there is feedback, address it: {feedback}

When the file is written, end your reply with this line on its own:

LORE_NODE_RESULT: success
````

<!-- /generated -->

## How it works

1. `write` drafts `draft.md`, which `review` needs as a file.
2. `review` is a `human` station: a person reports `approved` or `changes_requested`.
3. `changes_requested` goes back to `write`. Its `review_feedback` is bound to the writer's need `feedback`, which is `fresh`, so only the latest reason is briefed.
4. `iteration_max: 3` stops a loop that never converges.

## Try it in Studio

Run `floor-studio examples/cookbook`, open review-loop and choose Test locally. The draft is written by your own `claude`; you stand in for the reviewer, and the run folder keeps each draft and each decision. See [Testing a whole line](/floor/reference/studio/#testing-a-whole-line).
