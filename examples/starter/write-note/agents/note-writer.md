---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
config:
  max_turns: 10
---
Write one short sentence about {topic} into the file {note_path}. Do nothing else.

When the file is written, end your reply with this line on its own:

LORE_NODE_RESULT: success
