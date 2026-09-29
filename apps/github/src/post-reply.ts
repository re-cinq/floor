// The post-reply station: what lore's floor did in a hook, `postReplyFromNode`. It posts the agent's reply as a plain comment, deduped by visit.
import type { Handle } from "@floor/station";
import { listIssueComments, postIssueComment, pullRequestOf, type GitHubDeps, type PullRequest } from "./github.js";
import { parseReviewReply } from "./review-reply.js";

export function postReplyStation(github: GitHubDeps): Handle {
  return async (brief, tools) => {
    const pull = pullRequestOf(brief.needs.pr_url);
    const said = await tools.read("reply_output");
    const reply = parseReviewReply(said.toString());

    if (!pull) return { outcome: "failed", error: `"${brief.needs.pr_url}" is not a pull request's address` };
    if (!reply) return { outcome: "failed", error: "the reply has no REVIEW_REPLY block" };
    const url = await replied(github, pull, brief.visitId, reply);

    return { outcome: "success", produced: { reply_url: url } };
  };
}

// A reply for a visit already posted is not posted again: the marker in the comment's own body is the record of it.
async function replied(github: GitHubDeps, pull: PullRequest, visitId: string, reply: string): Promise<string> {
  const marker = `<!-- floor-reply: ${visitId} -->`;
  const existing = await listIssueComments(github, pull);
  const already = existing.find((comment) => comment.body.includes(marker));

  if (already) return already.htmlUrl;
  const posted = await postIssueComment(github, pull, `${marker}\n\n${reply}`);

  return posted.htmlUrl;
}
