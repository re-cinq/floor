// The read-review station: what lore's floor did before starting the line. It turns a submitted review into the reply agent's task.
import type { Handle } from "@floor/station";
import { getPullRequest, getReview, getReviewComments, pullRequestOf, type GitHubDeps, type PullRequest } from "./github.js";
import { replyDescription, reviewSubmittedFeedback, type ReplyIntent } from "./review-feedback.js";

export function readReviewStation(github: GitHubDeps): Handle {
  return async (brief) => {
    const pull = pullRequestOf(brief.needs.pr_url);

    if (!pull) return { outcome: "failed", error: `"${brief.needs.pr_url}" is not a pull request's address` };
    const feedback = await feedbackOf(github, pull, brief.needs);

    return { outcome: "success", produced: { review_feedback: feedback } };
  };
}

async function feedbackOf(github: GitHubDeps, pull: PullRequest, needs: Record<string, string>): Promise<string> {
  const [details, review, comments] = await Promise.all([
    getPullRequest(github, pull),
    getReview(github, pull, needs.review_id),
    getReviewComments(github, pull, needs.review_id),
  ]);
  const commentBody = reviewSubmittedFeedback(review.body ?? undefined, comments);

  return replyDescription(intentOf(needs.intent), { repo: `${pull.owner}/${pull.name}`, prNumber: pull.number, branch: details.branch, commentBody });
}

function intentOf(value: string): ReplyIntent {
  return value === "answer" ? "answer" : "address";
}
