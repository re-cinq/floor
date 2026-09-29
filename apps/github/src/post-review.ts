// The post-review station: what lore's floor did in a hook, `postReviewFromNode`. It reads the review the agent printed and posts it to the pull request.
import type { Handle } from "@floor/station";
import { markOf, signed } from "./floor-mark.js";
import { listReviews, postReview, pullRequestOf, type GitHubDeps, type PullRequest } from "./github.js";
import { readReview, reviewInBody, reviewRequest, type Review, type ReviewRequest } from "./review.js";

export function postReviewStation(github: GitHubDeps): Handle {
  return async (brief, tools) => {
    const pull = pullRequestOf(brief.needs.pr_url);
    const said = await tools.read("review_output");
    const read = readReview(said.toString());

    if (!pull) return { outcome: "failed", error: `"${brief.needs.pr_url}" is not a pull request's address` };
    if ("unreadable" in read) return { outcome: "failed", error: read.unreadable };
    const url = await posted(github, pull, { read, visitId: brief.visitId });

    return { outcome: "success", produced: { review_summary: `${read.verdict}: ${read.summary} (${read.findings.length} findings)`, review_url: url } };
  };
}

interface Reviewed {
  read: Review;
  visitId: string;
}

// A visit worked twice posts once: the review it posted the first time carries its mark.
async function posted(github: GitHubDeps, pull: PullRequest, reviewed: Reviewed): Promise<string> {
  const mark = markOf("review", reviewed.visitId);
  const reviews = await listReviews(github, pull);
  const already = reviews.find((review) => review.body.includes(mark));

  return already ? already.htmlUrl : postedNow(github, pull, reviewed);
}

// A review GitHub refuses for where a comment is placed is posted again with nothing placed: a finding said in the wrong spot is worth more than one not said.
async function postedNow(github: GitHubDeps, pull: PullRequest, reviewed: Reviewed): Promise<string> {
  const first = await postReview(github, pull, signedBy(reviewed.visitId, reviewRequest(reviewed.read)));

  if ("url" in first) return first.url;
  const second = await postReview(github, pull, signedBy(reviewed.visitId, reviewInBody(reviewed.read)));

  if ("url" in second) return second.url;
  throw new Error(`GitHub refused the review: ${second.refused}`);
}

function signedBy(visitId: string, request: ReviewRequest): ReviewRequest {
  return { ...request, body: signed("review", visitId, request.body) };
}
