// lore's own files, cut to what the tests read. The line is lore's code-review.yaml whole; the recipe is its front matter and the first and last lines of its prompt.
export const CODE_REVIEW_LINE = `
name: code-review
description: Review a PR.
version: 1
entry: review
exit: done
nodes:
  - id: review
    type: agent
    prompt_ref: code-review
    model: gemini-3.1-pro-preview
  - id: done
    type: retrospective
edges:
  - { from: review, to: done, on: success }
  - { from: review, to: done, on: changes_requested }
  - { from: review, to: review, on: failed, iteration_max: 1 }
`;

export const CODE_REVIEW_RECIPE = `---
timeout_minutes: 25
test_policy: none
model: gemini-3.1-pro-preview
repo_workdir: false
disallowed_tools:
  - Bash(npm:*)
  - Bash(sh:*)
---
{description}

The PR branch is already checked out locally at /workspace/target.
{previous_error}

Then output exactly one of:
- REVIEW_RESULT:APPROVED
- REVIEW_RESULT:CHANGES_REQUESTED:<one-line summary>
`;

export const PLANNING_LINE = `
name: feature-planning
description: Plan a feature.
version: 1
entry: analyze
exit: done
nodes:
  - id: analyze
    type: agent
    prompt_ref: feature-planning
    continues: { node: analyze, key: args.plan_id }
  - id: author
    type: feature_review
    route: /repos/{args.repo}/plans/{args.plan_id}
  - id: validate
    type: agent
    prompt_ref: missing-recipe
    by_hand: true
  - id: issues
    type: issues
  - id: done
    type: retrospective
edges:
  - { from: analyze, to: author, on: always }
  - { from: author, to: issues, on: always }
  - { from: validate, to: author, on: always }
  - { from: issues, to: done, on: always }
`;

export const PLANNING_RECIPE = "Plan {description} as plan {plan_id}.";
