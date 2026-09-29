// A git credential provider, for a laptop: it says what it was asked and answers with a token that opens nothing. The real one is lore's, and mints a GitHub App's.
import { createServer } from "node:http";

const DEFAULT_PORT = 8281;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const SERVICE_TOKEN = process.env.FLOOR_SERVICE_TOKEN ?? "";

createServer(async (request, response) => {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);
  const known = request.headers.authorization === `Bearer ${SERVICE_TOKEN}`;
  const asked = known ? JSON.parse(Buffer.concat(chunks).toString()) : {};

  console.log(known ? `[git-credentials] asked for ${asked.access} on ${asked.repoUrl}` : "[git-credentials] refused a caller that is not the floor");
  response.writeHead(known ? HTTP_OK : HTTP_UNAUTHORIZED, { "content-type": "application/json" });
  response.end(JSON.stringify(known ? { username: "x-access-token", password: `stand-in-${asked.access}-token` } : {}));
}).listen(PORT, () => console.log(`[git-credentials] listening on :${PORT}`));
