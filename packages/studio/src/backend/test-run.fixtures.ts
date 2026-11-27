import type { CollectionFile } from "@re-cinq/floor-pipeline";

const REVIEW_LOOP_LINE = `line:
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
`;

const DRAFT_WRITER_AGENT = `---
model: claude-sonnet-5-5
image: \${AGENT_IMAGE}
timeout_minutes: 10
config:
  max_turns: 10
---
Write a short draft about {topic} into the file {draft_path}.

If there is feedback, address it: {feedback}

When the file is written, end your reply with this line on its own:

LORE_NODE_RESULT: success
`;

export const REVIEW_LOOP_COLLECTION: readonly CollectionFile[] = [
  { path: "review-loop/assembly-line.yaml", text: REVIEW_LOOP_LINE },
  { path: "review-loop/agents/draft-writer.md", text: DRAFT_WRITER_AGENT },
];

const REVIEWER_FEEDBACK_PRODUCE = "      - name: review_feedback\n        kind: value\n";

/** The review-loop collection whose reviewer also produces the file annotated.md as annotated. */
export const ANNOTATING_REVIEWER_COLLECTION: readonly CollectionFile[] = [
  { path: "review-loop/assembly-line.yaml", text: REVIEW_LOOP_LINE.replace(REVIEWER_FEEDBACK_PRODUCE, `${REVIEWER_FEEDBACK_PRODUCE}      - name: annotated\n        kind: file\n        path: annotated.md\n`) },
  { path: "review-loop/agents/draft-writer.md", text: DRAFT_WRITER_AGENT },
];

/** The annotating review-loop collection with annotated declared at ../../escape.md. */
export const ESCAPING_REVIEWER_COLLECTION: readonly CollectionFile[] = ANNOTATING_REVIEWER_COLLECTION.map((file) => ({ ...file, text: file.text.replace("path: annotated.md", "path: ../../escape.md") }));

const REVIEW_NODE ="    - id: review\n      station: reviewer\n";

/** The review-loop collection whose node review pins station reviewer@abc123. */
export const PINNED_REVIEWER_COLLECTION: readonly CollectionFile[] = [
  { path: "review-loop/assembly-line.yaml", text: REVIEW_LOOP_LINE.replace(REVIEW_NODE, "    - id: review\n      station: reviewer@abc123\n") },
  { path: "review-loop/agents/draft-writer.md", text: DRAFT_WRITER_AGENT },
];
