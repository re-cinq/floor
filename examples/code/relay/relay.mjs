import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const { FLOOR_API_URL, FLOOR_SERVICE_TOKEN, RELAY_SECRET, PORT = "8200" } = process.env;
const UNAUTHORIZED = 401;
const ACCEPTED = 202;
const FLOOR_TIMEOUT_MS = 10000;

function isSignedBy(secret, body, signature = "") {
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const given = Buffer.from(signature);

  return given.length === expected.length && timingSafeEqual(given, expected);
}

function flattened({ ticket }) {
  return { ticketId: ticket.id, title: ticket.title, priority: ticket.priority, author: ticket.author.name };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  return Buffer.concat(chunks);
}

function postToFloor(payload, deliveryId) {
  return fetch(`${FLOOR_API_URL}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${FLOOR_SERVICE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "ticket.created", payload, dedupeKey: `ticket.created:${deliveryId}` }),
    signal: AbortSignal.timeout(FLOOR_TIMEOUT_MS),
  });
}

createServer(async (request, response) => {
  const body = await readBody(request);
  if (!isSignedBy(RELAY_SECRET, body, request.headers["x-signature"])) return response.writeHead(UNAUTHORIZED).end();

  const deliveryId = request.headers["x-delivery-id"];
  const floorResponse = await postToFloor(flattened(JSON.parse(body)), deliveryId);
  console.log(`delivery ${deliveryId}: floor answered ${floorResponse.status}`);
  response.writeHead(floorResponse.ok ? ACCEPTED : floorResponse.status).end();
}).listen(PORT, () => console.log(`relay listening on ${PORT}`));
