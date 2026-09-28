// The post-review station: what lore's floor did in a hook, `postReviewFromNode`. It reads the review the agent printed and posts it to the pull request.
import type { Handle } from "@floor/station";
import { postReview, pullRequestOf, type GitHubDeps } from "./github.js";
import { readReview, reviewInBody, reviewRequest, type Review } from "./review.js";

export function postReviewStation(github: GitHubDeps): Handle {
  return async (brief, tools) => {
    const pull = pullRequestOf(brief.needs.pr_url);
    const said = await tools.read("review_output");
    const read = readReview(said.toString());

    if (!pull) return { outcome: "failed", error: `"${brief.needs.pr_url}" is not a pull request's address` };
    if ("unreadable" in read) return { outcome: "failed", error: read.unreadable };
    const url = await posted(github, pull, read);

    return { outcome: "success", produced: { review_summary: `${read.verdict}: ${read.summary} (${read.findings.length} findings)`, review_url: url } };
  };
}

// A review GitHub refuses for where a comment is placed is posted again with nothing placed: a finding said in the wrong spot is worth more than one not said.
async function posted(github: GitHubDeps, pull: NonNullable<ReturnType<typeof pullRequestOf>>, read: Review): Promise<string> {
  const first = await postReview(github, pull, reviewRequest(read));

  if ("url" in first) return first.url;
  const second = await postReview(github, pull, reviewInBody(read));

  if ("url" in second) return second.url;
  throw new Error(`GitHub refused the review: ${second.refused}`);
}
