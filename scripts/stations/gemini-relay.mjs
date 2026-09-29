// Gemini, for a laptop with a gcloud login and no API key. A pod asks this relay, and the relay asks Vertex AI as you: your login stays on this machine, and the pod holds a key that opens the relay and nothing else.
import { execFile } from "node:child_process";
import { timingSafeEqual, createHash } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";

const VERTEX = "https://aiplatform.googleapis.com";
const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_GATEWAY = 502;
/** Google's tokens last an hour; one is asked for again after fifty minutes. */
const TOKEN_LIFETIME_MS = 3_000_000;
const REQUEST_TIMEOUT_MS = 600_000;
const PROJECT = required("GOOGLE_CLOUD_PROJECT");
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
const RELAY_KEY = required("GEMINI_RELAY_KEY");

let held = { token: "", until: 0 };

function required(name) {
  const given = process.env[name];

  if (!given) throw new Error(`missing required environment variable ${name}`);

  return given;
}

async function relayed(request, response) {
  if (!isKnown(request)) return response.writeHead(HTTP_UNAUTHORIZED).end();
  const answer = await fetch(vertexUrl(request.url), {
    method: request.method,
    headers: { authorization: `Bearer ${await tokenNow()}`, "x-goog-user-project": PROJECT, "content-type": request.headers["content-type"] ?? "application/json" },
    body: ["GET", "HEAD"].includes(request.method) ? undefined : Readable.toWeb(request),
    duplex: "half",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  console.log(`[gemini-relay] ${request.method} ${new URL(request.url, "http://relay").pathname}: ${answer.status}`);
  response.writeHead(answer.status, { "content-type": answer.headers.get("content-type") ?? "application/json" });

  return answer.body ? Readable.fromWeb(answer.body).pipe(response) : response.end();
}

function isKnown(request) {
  const asked = new URL(request.url, "http://relay");
  const given = request.headers["x-goog-api-key"] ?? asked.searchParams.get("key") ?? "";

  return timingSafeEqual(digestOf(String(given)), digestOf(RELAY_KEY));
}

function digestOf(text) {
  return createHash("sha256").update(text).digest();
}

// A pod with a key names a model and no project; Vertex, asked as a person, wants the project and the place.
function vertexUrl(requestUrl) {
  const asked = new URL(requestUrl, "http://relay");
  const path = asked.pathname.replace(/^(\/v1[^/]*)\/publishers\//, `$1/projects/${PROJECT}/locations/${LOCATION}/publishers/`);

  asked.searchParams.delete("key");

  return `${VERTEX}${path}${asked.search}`;
}

// Asked of gcloud, which reads your application-default credentials; the token is kept in memory and never written or printed.
function tokenNow() {
  if (Date.now() < held.until) return Promise.resolve(held.token);

  return new Promise((resolve, reject) => {
    execFile("gcloud", ["auth", "application-default", "print-access-token"], (error, stdout) => {
      if (error) return reject(new Error("gcloud gave no token: run 'gcloud auth application-default login'"));
      held = { token: stdout.trim(), until: Date.now() + TOKEN_LIFETIME_MS };

      return resolve(held.token);
    });
  });
}

const DEFAULT_PORT = 8282;
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const HOST = process.env.RELAY_HOST ?? "0.0.0.0";
const relay = createServer((request, response) => {
  relayed(request, response).catch((error) => {
    console.log(`[gemini-relay] failed: ${error.message}`);
    if (!response.headersSent) response.writeHead(HTTP_BAD_GATEWAY);
    response.end();
  });
});

relay.listen(PORT, HOST, () => console.log(`[gemini-relay] listening on ${HOST}:${PORT}, asking Vertex AI as you, in ${PROJECT}/${LOCATION}`));
