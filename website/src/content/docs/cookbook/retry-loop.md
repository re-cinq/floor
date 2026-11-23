---
title: Retry loop
description: Retry a failed agent step with its error in the prompt, and stop after a limit.
wordBudget: 150
sidebar:
  order: 1
---

Use this when an agent can fail and a second try, told what went wrong, may succeed.

<!-- generated:example:cookbook/retry-loop/assembly-line.yaml -->

````yaml title="retry-loop/assembly-line.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: retry-loop
  entry: attempt
  exit: done
  start:
    on:
      - task.requested
    args:
      task: "{task}"
  args:
    task:
      kind: value
      subject: true
  nodes:
    - id: attempt
      station: solve-task
    - id: done
  edges:
    - from: attempt
      to: done
      on: success
    - from: attempt
      to: attempt
      on: failed
      iteration_max: 3
stations:
  solve-task:
    description: An agent solves the task, and is told what went wrong on a retry.
    kind: agent
    agent_definition: task-solver
    outcomes:
      - success
      - failed
    result_required: true
    needs:
      - name: task
        kind: value
    produces:
      - name: answer
        kind: file
        path: answer.md
````

<!-- /generated -->

<!-- generated:example:cookbook/retry-loop/agents/task-solver.md -->

````markdown title="retry-loop/agents/task-solver.md"
---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
---
Solve this task and write the answer into {answer_path}: {task}

The last attempt failed with this error. On a first attempt it is not filled in:

{previous_error}

End your reply with LORE_NODE_RESULT: success on its own line, or LORE_NODE_RESULT: failed if you could not solve it.
````

<!-- /generated -->

## How it works

1. The edge `attempt` to `attempt` on `failed` sends a failed visit back to the same node.
2. `iteration_max: 3` lets a run take that edge three times.
3. A retry visit is given `{previous_error}` in the prompt. On the first visit it stays as written.
4. When the run needs the edge a fourth time, it ends with the outcome `iteration_max`. It does not go to a fail node.

See [The next node](/floor/specs/run-semantics/#4-the-next-node) and [Prompt placeholders](/floor/specs/placeholders/#2-prompt-placeholders).
