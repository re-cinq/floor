// GitHub, as the post-review, read-review and post-reply stations reach it.
import type { Repository, TokenFor } from "./github-auth.js";
import type { ReviewComment } from "./review-feedback.js";
import type { ReviewRequest } from "./review.js";

const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_UNPROCESSABLE = 422;
/** The most GitHub gives in one answer; it gives thirty unless asked. */
const PAGE_SIZE = 100;
/** Five thousand comments, past which a thread is read no further. */
const MAX_PAGES = 50;
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
  return githubPages(deps, pull, `/pulls/${pull.number}/reviews/${reviewId}/comments`);
}

/** Something said on a pull request, a comment or a review, and where it can be read. */
export interface Said {
  body: string;
  htmlUrl: string;
}

export async function listReviews(deps: GitHubDeps, pull: PullRequest): Promise<Said[]> {
  const reviews = await githubPages<FetchedSaid>(deps, pull, `/pulls/${pull.number}/reviews`);

  return reviews.map(saidOf);
}

export async function listIssueComments(deps: GitHubDeps, pull: PullRequest): Promise<Said[]> {
  const comments = await githubPages<FetchedSaid>(deps, pull, `/issues/${pull.number}/comments`);

  return comments.map(saidOf);
}

export async function postIssueComment(deps: GitHubDeps, pull: PullRequest, body: string): Promise<Said> {
  const posted = await githubJson<FetchedSaid>(deps, pull, `/issues/${pull.number}/comments`, { method: "POST", body: { body } });

  return saidOf(posted);
}

interface PullDetails {
  head: { ref: string };
}

// GitHub's own field name.
/* eslint-disable @typescript-eslint/naming-convention */
interface FetchedSaid {
  /** Null for a review that is inline comments and no more. */
  body: string | null;
  html_url: string;
}
/* eslint-enable @typescript-eslint/naming-convention */

function saidOf(fetched: FetchedSaid): Said {
  return { body: fetched.body ?? "", htmlUrl: fetched.html_url };
}

// Every page, one after another: how many there are is known only when one comes back short.
async function githubPages<Row>(deps: GitHubDeps, pull: PullRequest, path: string, page = 1): Promise<Row[]> {
  const fetched = await githubJson<Row[]>(deps, pull, `${path}?per_page=${PAGE_SIZE}&page=${page}`);

  if (fetched.length < PAGE_SIZE || page >= MAX_PAGES) return fetched;

  return [...fetched, ...(await githubPages<Row>(deps, pull, path, page + 1))];
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
