// Pure: a submitted review's body and inline comments, turned into the reply agent's task. Ported from lore's code-review-decisions.ts.

export interface ReviewComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
}

export type ReplyIntent = "address" | "answer";

export interface ReplyContext {
  repo: string;
  prNumber: number;
  branch: string;
  commentBody: string;
  inReplyToId?: number;
}

export function reviewFeedback(body: string, comments: ReviewComment[]): string {
  const lines = comments.map((comment) => `- inline comment ${comment.id} on ${whereOf(comment)}: ${comment.body}`);
  const trimmed = body.trim();

  if (lines.length === 0) return trimmed;
  const inline = `Inline comments:\n${lines.join("\n")}`;

  return trimmed ? `${trimmed}\n\n${inline}` : inline;
}

export function reviewSubmittedFeedback(body: string | undefined, comments: ReviewComment[]): string {
  return reviewFeedback(body ?? "", comments) || "changes requested in a submitted review";
}

export function replyDescription(intent: ReplyIntent, ctx: ReplyContext): string {
  const thread = ctx.inReplyToId ? ` (reply on review-comment thread ${ctx.inReplyToId})` : "";
  const head = `On pull request #${ctx.prNumber} in ${ctx.repo} (branch ${ctx.branch})${thread}, a human commented: ${ctx.commentBody}`;

  return intent === "address"
    ? `${head}\n\nThey approved a fix — implement it and commit to the PR branch, then confirm briefly in the thread.`
    : `${head}\n\nAnswer their question briefly in the review thread; do not change code.`;
}

function whereOf(comment: ReviewComment): string {
  return comment.line === null ? comment.path : `${comment.path}:${comment.line}`;
}
