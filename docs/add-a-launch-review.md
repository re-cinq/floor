# Add a second sign-off to a launch

The checkout pilot now includes an email to customers. Product decides whether the feature is ready. Communications decides whether the announcement is ready. Either team can put the launch on hold.

Start with the `launch-approval/pipeline.yaml` you wrote in [Define your first assembly line](define-a-launch-approval.md). You'll change the route an approval takes and check that both teams get their say.

## 1. Locate the rule you're changing

Find `from: product-review, on: approved, to: ready` in the file. As written, Product can finish the run on its own. For the new policy, a Product approval should lead to `comms-review`. A Product hold should still end the attempt immediately.

## 2. Add the new stop and connect it

Replace the `nodes` and `edges` sections under `line` with the two sections below. Keep the rest of the file, including the `stations` section.

```yaml
  nodes:
    - id: product-review
      station: launch-signoff
      reports:
        - { on: launch.product-decided, when: { decision: approve }, outcome: approved }
        - { on: launch.product-decided, when: { decision: hold }, outcome: held }
    - id: comms-review
      station: launch-signoff
      reports:
        - { on: launch.comms-decided, when: { decision: approve }, outcome: approved }
        - { on: launch.comms-decided, when: { decision: hold }, outcome: held }
    - { id: ready }
    - { id: held }
  edges:
    - { from: product-review, on: approved, to: comms-review }
    - { from: product-review, on: held, to: held }
    - { from: comms-review, on: approved, to: ready }
    - { from: comms-review, on: held, to: held }
```

Both reviews use the same `launch-signoff` station because both ask a person to approve or hold. Each stop listens for its own event. A second Product approval therefore can't count as Communications approval.

## 3. Walk the new rule with both teams

| Product decides | Communications decides | Expected result |
| --- | --- | --- |
| Hold | No decision needed | The run ends as held before it reaches Communications. |
| Approve | Still reviewing | The run stays open at `comms-review`. |
| Approve | Hold | The run ends as held. |
| Approve | Approve | The run ends as ready. |

For a live trial, import or sync the edited file and submit a fresh launch called `checkout-email`. An open run keeps the line version it started on. After Product approves, check that the new run is waiting at `comms-review`. Have your test integration send `launch.comms-decided` with `{"subjectKey":"launch_id:checkout-email","decision":"approve"}`. That run should now show `success`. [Watch a run](using.md#watch-a-run)

When you propose the change, include the table in the pull request. The engineer connecting the decision tool can use the event names in the file, and the two reviewers can use the table to check what happens to a real launch.
