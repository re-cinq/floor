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

export interface FakeGitHub {
  apiUrl: string;
  /** Every request taken, as `METHOD path`. */
  asked: string[];
  reviews: unknown[];
  close(): Promise<void>;
}

interface Answer {
  status: number;
  body: unknown;
}

export async function startFakeGitHub(appPublicKey: string, tokenExpires: Date): Promise<FakeGitHub> {
  const asked: string[] = [];
  const reviews: unknown[] = [];
  const server = createServer((request, response) => {
    void bodyOf(request).then((body) => {
      asked.push(`${request.method} ${request.url}`);
      const answer = answerTo(request, body, { appPublicKey, tokenExpires, reviews });

      response.writeHead(answer.status, { "content-type": "application/json" }).end(JSON.stringify(answer.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  return { apiUrl: `http://localhost:${(server.address() as AddressInfo).port}`, asked, reviews, close: () => closed(server) };
}

function closed(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

interface Knows {
  appPublicKey: string;
  tokenExpires: Date;
  reviews: unknown[];
}

function answerTo(request: IncomingMessage, body: string, knows: Knows): Answer {
  const path = request.url ?? "";
  const bearer = (request.headers.authorization ?? "").replace("Bearer ", "");

  if (path.endsWith("/installation")) return asApp(bearer, knows, { id: INSTALLATION_ID });
  if (path === `/app/installations/${INSTALLATION_ID}/access_tokens`) return asApp(bearer, knows, { token: INSTALLATION_TOKEN, expires_at: knows.tokenExpires.toISOString() });
  if (path.endsWith("/reviews")) return review(bearer, body, knows);

  return { status: HTTP_NOT_FOUND, body: { message: "Not Found" } };
}

function asApp(claim: string, knows: Knows, body: unknown): Answer {
  return isAppClaim(claim, knows.appPublicKey) ? { status: HTTP_OK, body } : { status: HTTP_UNAUTHORIZED, body: { message: "Bad credentials" } };
}

function isAppClaim(claim: string, publicKey: string): boolean {
  const [header, payload, signature] = claim.split(".");

  if (!header || !payload || !signature) return false;

  return createVerify("RSA-SHA256").update(`${header}.${payload}`).verify(publicKey, signature, "base64url");
}

function review(token: string, body: string, knows: Knows): Answer {
  if (token !== INSTALLATION_TOKEN && token !== GIVEN_TOKEN) return { status: HTTP_UNAUTHORIZED, body: { message: "Bad credentials" } };
  const posted = JSON.parse(body) as { comments: { line: number }[] };

  if (posted.comments.some((comment) => comment.line > LAST_LINE)) return { status: HTTP_UNPROCESSABLE, body: { message: "Line could not be resolved" } };
  knows.reviews.push(posted);

  return { status: HTTP_OK, body: { html_url: `https://github.com/re-cinq/floor/pull/12#pullrequestreview-${knows.reviews.length}` } };
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString();
}
