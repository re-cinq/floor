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
