---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
---
Solve this task and write the answer into {answer_path}: {task}

The last attempt failed with this error. On a first attempt it is not filled in:

{previous_error}

End your reply with LORE_NODE_RESULT: success on its own line, or LORE_NODE_RESULT: failed if you could not solve it.
