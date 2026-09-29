// A stand-in for GitHub's API for the tests, over real HTTP: it checks an app's claim against the app's public key as GitHub does, grants a token, and takes reviews, refusing one that comments past the end of the file.
import { createVerify } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const INSTALLATION_TOKEN = "ghs_installation";
export const GIVEN_TOKEN = "ghp_given";
export const LAST_LINE = 100;
const INSTALLATION_ID = 7;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;

export interface Fixtures {
  branch: string;
  reviewBody: string | null;
  reviewComments: unknown[];
}

export interface FakeGitHub {
  apiUrl: string;
  /** Every request taken, as `METHOD path`. */
  asked: string[];
  reviews: unknown[];
  /** What each token granted was narrowed to; null for one that was not. */
  grants: unknown[];
  /** Issue comments: seeded to answer a GET, and appended to by a POST, as a real thread would be. */
  issueComments: unknown[];
  /** What a GET for a pull request, a review or its comments answers with. Tests set these before calling a station. */
  fixtures: Fixtures;
  close(): Promise<void>;
}

interface Answer {
  status: number;
  body: unknown;
}

export async function startFakeGitHub(appPublicKey: string, tokenExpires: Date): Promise<FakeGitHub> {
  const asked: string[] = [];
  const reviews: unknown[] = [];
  const grants: unknown[] = [];
  const issueComments: unknown[] = [];
  const fixtures: Fixtures = { branch: "main", reviewBody: null, reviewComments: [] };
  const server = createServer((request, response) => {
    void bodyOf(request).then((body) => {
      asked.push(`${request.method} ${request.url}`);
      const answer = answerTo(request, body, { appPublicKey, tokenExpires, reviews, grants, issueComments, fixtures });

      response.writeHead(answer.status, { "content-type": "application/json" }).end(JSON.stringify(answer.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  return {
    apiUrl: `http://localhost:${(server.address() as AddressInfo).port}`,
    asked,
    reviews,
    grants,
    issueComments,
    fixtures,
    close: () => closed(server),
  };
}

function closed(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

interface Knows {
  appPublicKey: string;
  tokenExpires: Date;
  reviews: unknown[];
  grants: unknown[];
  issueComments: unknown[];
  fixtures: Fixtures;
}

interface Asked {
  path: string;
  /** Which page of a list, as GitHub reads `per_page` and `page`. */
  page: { size: number; number: number };
  method: string;
  bearer: string;
  body: string;
}

const GITHUB_PAGE_SIZE = 30;

const REVIEW_COMMENTS_PATH = /\/pulls\/\d+\/reviews\/\d+\/comments$/;
const REVIEW_PATH = /\/pulls\/\d+\/reviews\/\d+$/;
const PULL_PATH = /\/pulls\/\d+$/;
const ISSUE_COMMENTS_PATH = /\/issues\/\d+\/comments$/;

function answerTo(request: IncomingMessage, body: string, knows: Knows): Answer {
  const url = new URL(request.url ?? "", "http://github.test");
  const asked: Asked = {
    path: url.pathname,
    page: pageOf(url.searchParams),
    method: request.method ?? "GET",
    bearer: (request.headers.authorization ?? "").replace("Bearer ", ""),
    body,
  };

  return answerAuth(asked, knows) ?? answerFixture(asked, knows) ?? { status: HTTP_NOT_FOUND, body: { message: "Not Found" } };
}

function pageOf(query: URLSearchParams): Asked["page"] {
  return { size: Number(query.get("per_page") ?? GITHUB_PAGE_SIZE), number: Number(query.get("page") ?? 1) };
}

function answerAuth(asked: Asked, knows: Knows): Answer | undefined {
  if (asked.path.endsWith("/installation")) return asApp(asked.bearer, knows, { id: INSTALLATION_ID });
  if (asked.path === `/app/installations/${INSTALLATION_ID}/access_tokens`) return grant(asked.bearer, asked.body, knows);
  if (asked.path.endsWith("/reviews")) return asked.method === "POST" ? review(asked.bearer, asked.body, knows) : reviewsSoFar(asked, knows);

  return undefined;
}

function answerFixture(asked: Asked, knows: Knows): Answer | undefined {
  if (REVIEW_COMMENTS_PATH.test(asked.path)) return reviewComments(asked, knows);
  if (REVIEW_PATH.test(asked.path)) return fetchedReview(asked.bearer, knows);
  if (PULL_PATH.test(asked.path)) return pullDetails(asked.bearer, knows);
  if (ISSUE_COMMENTS_PATH.test(asked.path)) return issueCommentsAnswer(asked, knows);

  return undefined;
}

function reviewComments(asked: Asked, knows: Knows): Answer {
  return authorized(asked.bearer) ? { status: HTTP_OK, body: paged(knows.fixtures.reviewComments, asked.page) } : unauthorized();
}

function fetchedReview(bearer: string, knows: Knows): Answer {
  return authorized(bearer) ? { status: HTTP_OK, body: { body: knows.fixtures.reviewBody } } : unauthorized();
}

function pullDetails(bearer: string, knows: Knows): Answer {
  return authorized(bearer) ? { status: HTTP_OK, body: { head: { ref: knows.fixtures.branch } } } : unauthorized();
}

function issueCommentsAnswer(asked: Asked, knows: Knows): Answer {
  if (!authorized(asked.bearer)) return unauthorized();
  if (asked.method !== "POST") return { status: HTTP_OK, body: paged(knows.issueComments, asked.page) };
  const number = knows.issueComments.length + 1;
  const comment = { ...(JSON.parse(asked.body) as { body: string }), html_url: `https://github.com/re-cinq/floor/issues/12#issuecomment-${number}` };

  knows.issueComments.push(comment);

  return { status: HTTP_OK, body: comment };
}

function paged(rows: unknown[], page: Asked["page"]): unknown[] {
  return rows.slice((page.number - 1) * page.size, page.number * page.size);
}

function authorized(token: string): boolean {
  return token === INSTALLATION_TOKEN || token === GIVEN_TOKEN;
}

function unauthorized(): Answer {
  return { status: HTTP_UNAUTHORIZED, body: { message: "Bad credentials" } };
}

function grant(claim: string, body: string, knows: Knows): Answer {
  const granted = asApp(claim, knows, { token: INSTALLATION_TOKEN, expires_at: knows.tokenExpires.toISOString() });

  if (granted.status === HTTP_OK) knows.grants.push(body ? JSON.parse(body) : null);

  return granted;
}

function asApp(claim: string, knows: Knows, body: unknown): Answer {
  return isAppClaim(claim, knows.appPublicKey) ? { status: HTTP_OK, body } : { status: HTTP_UNAUTHORIZED, body: { message: "Bad credentials" } };
}

function isAppClaim(claim: string, publicKey: string): boolean {
  const [header, payload, signature] = claim.split(".");

  if (!header || !payload || !signature) return false;

  return createVerify("RSA-SHA256").update(`${header}.${payload}`).verify(publicKey, signature, "base64url");
}

function reviewsSoFar(asked: Asked, knows: Knows): Answer {
  return authorized(asked.bearer) ? { status: HTTP_OK, body: paged(knows.reviews, asked.page) } : unauthorized();
}

function review(token: string, body: string, knows: Knows): Answer {
  if (!authorized(token)) return unauthorized();
  const posted = JSON.parse(body) as { comments: { line: number }[] };

  if (posted.comments.some((comment) => comment.line > LAST_LINE)) return { status: HTTP_UNPROCESSABLE, body: { message: "Line could not be resolved" } };
  const taken = { ...posted, html_url: `https://github.com/re-cinq/floor/pull/12#pullrequestreview-${knows.reviews.length + 1}` };

  knows.reviews.push(taken);

  return { status: HTTP_OK, body: taken };
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString();
}
