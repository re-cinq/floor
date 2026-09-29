// GitHub, as the post-review, read-review and post-reply stations reach it.
import type { Repository, TokenFor } from "./github-auth.js";
import type { ReviewComment } from "./review-feedback.js";
import type { ReviewRequest } from "./review.js";

const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_UNPROCESSABLE = 422;
const PULL_REQUEST_URL = /^https:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

export interface PullRequest extends Repository {
  number: number;
}

export interface GitHubDeps {
  apiUrl: string;
  tokenFor: TokenFor;
}

export type Posted = { url: string } | { refused: string };

export function pullRequestOf(url: string): PullRequest | null {
  const parts = PULL_REQUEST_URL.exec(url);

  return parts ? { owner: parts[1], name: parts[2], number: Number(parts[3]) } : null;
}

/** `refused` is GitHub saying the review cannot be posted as it is, 422: most often a comment on a line the pull request does not touch. Anything else it answers is thrown. */
export async function postReview(deps: GitHubDeps, pull: PullRequest, review: ReviewRequest): Promise<Posted> {
  const response = await fetch(`${deps.apiUrl}/repos/${pull.owner}/${pull.name}/pulls/${pull.number}/reviews`, {
    method: "POST",
    headers: { authorization: `Bearer ${await deps.tokenFor(pull)}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: JSON.stringify(review),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === HTTP_UNPROCESSABLE) return { refused: await response.text() };
  if (!response.ok) throw new Error(`GitHub answered ${response.status} to the review: ${await response.text()}`);
  const posted = (await response.json()) as PostedReview;

  return { url: posted.html_url };
}

// GitHub's own field name.
/* eslint-disable @typescript-eslint/naming-convention */
interface PostedReview {
  html_url: string;
}
/* eslint-enable @typescript-eslint/naming-convention */

export async function getPullRequest(deps: GitHubDeps, pull: PullRequest): Promise<{ branch: string }> {
  const details = await githubJson<PullDetails>(deps, pull, `/pulls/${pull.number}`);

  return { branch: details.head.ref };
}

export async function getReview(deps: GitHubDeps, pull: PullRequest, reviewId: string): Promise<{ body: string | null }> {
  return githubJson(deps, pull, `/pulls/${pull.number}/reviews/${reviewId}`);
}

export async function getReviewComments(deps: GitHubDeps, pull: PullRequest, reviewId: string): Promise<ReviewComment[]> {
  return githubJson(deps, pull, `/pulls/${pull.number}/reviews/${reviewId}/comments`);
}

export interface IssueComment {
  body: string;
  htmlUrl: string;
}

export async function listIssueComments(deps: GitHubDeps, pull: PullRequest): Promise<IssueComment[]> {
  const comments = await githubJson<FetchedIssueComment[]>(deps, pull, `/issues/${pull.number}/comments`);

  return comments.map(issueCommentOf);
}

export async function postIssueComment(deps: GitHubDeps, pull: PullRequest, body: string): Promise<IssueComment> {
  const posted = await githubJson<FetchedIssueComment>(deps, pull, `/issues/${pull.number}/comments`, { method: "POST", body: { body } });

  return issueCommentOf(posted);
}

interface PullDetails {
  head: { ref: string };
}

// GitHub's own field name.
/* eslint-disable @typescript-eslint/naming-convention */
interface FetchedIssueComment {
  body: string;
  html_url: string;
}
/* eslint-enable @typescript-eslint/naming-convention */

function issueCommentOf(comment: FetchedIssueComment): IssueComment {
  return { body: comment.body, htmlUrl: comment.html_url };
}

async function githubJson<Answer>(deps: GitHubDeps, pull: PullRequest, path: string, init: { method?: string; body?: unknown } = {}): Promise<Answer> {
  const response = await fetch(`${deps.apiUrl}/repos/${pull.owner}/${pull.name}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${await deps.tokenFor(pull)}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${init.method ?? "GET"} ${path}: ${await response.text()}`);

  return (await response.json()) as Answer;
}
