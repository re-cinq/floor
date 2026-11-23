---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
---
Summarize this section in one sentence: {item}

End your reply with this line on its own, with your sentence as the summary:

LORE_NODE_RESULT: {"outcome": "success", "produced": {"summary": "<your sentence>"}}
