// Pure: the agent's fenced REVIEW_REPLY block, as posted. Ported from lore's review-reply.ts.

const REPLY_BLOCK = /```REVIEW_REPLY\s*\n([\s\S]*?)```/;

export function parseReviewReply(output: string): string | null {
  const match = output.match(REPLY_BLOCK);

  if (!match) return null;
  const body = match[1].trim();

  return body.length > 0 ? body : null;
}
