---
title: Define your first assembly line
description: Write the rule that a product manager signs off a launch, in a YAML file your team can review and run.
sidebar:
  order: 2
---

The checkout team wants a product manager to sign off before it launches a pilot. You'll write that rule in a file your team can review and run. You can do the exercise in a text editor. You'll only need a running floor when you're ready to try it with an engineer.

## 1. Decide what happens to one launch

Use `checkout-pilot` as your example. The [assembly line](/floor/concepts/assembly-line/) is the rule for every launch. An [assembly run](/floor/concepts/assembly-run/) follows one launch through that rule.

| When this happens | What should happen to checkout-pilot? |
| --- | --- |
| The team submits the launch | Open a run and wait for Product. |
| Product hasn't answered | Keep waiting. |
| Product approves | Finish the run as ready to launch. |
| Product puts the launch on hold | End this attempt. The team can submit it again after resolving the concern. |

Read the last row with your team. Ending the attempt and waiting for more information are different product decisions. Here, the team has chosen to end the attempt. A run that reaches `ready` records approval. Deployment is a separate action.

## 2. Write the rule in YAML

Create a file called `pipeline.yaml` and copy the definition below. In a collection, put it in a folder called `launch-approval` so the folder matches the line's `id`. Keep the indentation when you copy it. In YAML, indentation groups the lines that belong together.

```yaml
line:
  id: launch-approval
  entry: product-review
  exit: ready
  fail: held
  start:
    on: [launch.submitted]
    args: { launch_id: "{launch_id}" }
  args:
    launch_id: { kind: value, subject: true }
  nodes:
    - id: product-review
      station: launch-signoff
      reports:
        - { on: launch.product-decided, when: { decision: approve }, outcome: approved }
        - { on: launch.product-decided, when: { decision: hold }, outcome: held }
    - { id: ready }
    - { id: held }
  edges:
    - { from: product-review, on: approved, to: ready }
    - { from: product-review, on: held, to: held }

stations:
  launch-signoff:
    kind: human
    outcomes: [approved, held]
    needs: []
    produces: []
```

Read the two `edges` aloud. Each says where the launch goes after a decision. The names under `nodes` are the stops along the way. The `launch-signoff` [station](/floor/concepts/station/) is the work at the first stop. Its `kind: human` tells the floor to wait for a decision.

The `start` section tells the floor which event opens the run and where to find the launch ID. Marking that ID as the `subject` means two submissions for `checkout-pilot` join the same open run. Under `reports`, the two rules translate the team's answer into an outcome that an edge can follow.

## 3. Try one launch

First trace it on paper. Put a finger on `product-review`, choose `hold`, and follow the matching edge. You should land on `held`. The floor calls that run's result `failed` because `held` is the ending you named under `fail`. In this workflow that means Product held the launch.

For a live trial, have an engineer import the file on a test floor with [`floor-pipeline`](/floor/reference/cli/) or merge it into a connected test collection. Agree on where the PM records the decision. The tool that owns that record must send the corresponding event to the floor. The names below are part of this example.

| Event sent to the floor | Payload for this trial | Expected result |
| --- | --- | --- |
| `launch.submitted` | `{"launch_id":"checkout-pilot"}` | One run waits at `product-review`. |
| `launch.product-decided` | `{"subjectKey":"launch_id:checkout-pilot","decision":"approve"}` | The same run finishes with `success`. |

Is Product's approval enough when the launch includes a customer announcement? [Add a second sign-off](/floor/tutorials/add-a-launch-review/).
