import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FloorEvent } from "./floor-event.js";
import { buildReceiver } from "./receiver.js";
import { signatureOf } from "./signature.js";

const SECRET = "webhook-secret";
const OPENED = JSON.stringify({ action: "opened", number: 12, repository: { full_name: "re-cinq/floor" }, sender: { login: "bogdan" } });

let receiver: Server;
let url = "";
let floorIsUp = true;
const handed: FloorEvent[] = [];

beforeAll(async () => {
  receiver = buildReceiver({ webhookSecret: SECRET, post: (event) => (floorIsUp ? Promise.resolve(void handed.push(event)) : Promise.reject(new Error("the floor is down"))) });
  await new Promise<void>((resolve) => receiver.listen(0, resolve));
  url = `http://localhost:${(receiver.address() as AddressInfo).port}/webhooks/github`;
});

beforeEach(() => {
  handed.length = 0;
  floorIsUp = true;
});

afterAll(async () => {
  await new Promise((resolve) => receiver.close(resolve));
});

interface Sent {
  body?: string;
  signature?: string;
  event?: string;
  to?: string;
}

async function deliver(sent: Sent = {}): Promise<number> {
  const body = sent.body ?? OPENED;
  const headers = { "x-github-event": sent.event ?? "pull_request", "x-github-delivery": "delivery-1", "x-hub-signature-256": sent.signature ?? signatureOf(Buffer.from(body), SECRET) };
  const response = await fetch(sent.to ?? url, { method: "POST", headers, body, signal: AbortSignal.timeout(5000) });

  return response.status;
}

describe("the webhook receiver", () => {
  it("accepts a delivery GitHub signed", async () => {
    expect(await deliver()).toBe(202);
  });

  it("hands it to the floor as an event", async () => {
    await deliver();

    expect(handed).toMatchObject([{ name: "github.pull_request.opened", dedupeKey: "github:delivery-1", payload: { repository: "github.com/re-cinq/floor" } }]);
  });

  it("forged sender: refuses a delivery signed with another secret", async () => {
    expect(await deliver({ signature: signatureOf(Buffer.from(OPENED), "someone-else") })).toBe(401);
  });

  it("forged sender: hands the floor nothing of a delivery it refused", async () => {
    await deliver({ signature: "sha256=00" });

    expect(handed).toEqual([]);
  });

  it("answers a ping, which is about no repository, and hands nothing on", async () => {
    expect(await deliver({ event: "ping", body: '{"zen":"Keep it logically awesome."}' })).toBe(204);
  });

  it("answers 502 when the floor cannot be reached, so GitHub delivers again", async () => {
    floorIsUp = false;

    expect(await deliver()).toBe(502);
  });

  it("knows no other path", async () => {
    expect(await deliver({ to: url.replace("/webhooks/github", "/anything-else") })).toBe(404);
  });

  it("answers 404 to a GET, which posts no webhook", async () => {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });

    expect(response.status).toBe(404);
  });

  it("answers 413 to a body over GitHub's own cap, unsigned or not", async () => {
    const oversized = Buffer.alloc(26_214_401);
    const response = await fetch(url, { method: "POST", headers: { "x-hub-signature-256": "sha256=00" }, body: oversized, signal: AbortSignal.timeout(5000) });

    expect(response.status).toBe(413);
  });

  it("still hands the floor something when GitHub's own headers are missing", async () => {
    const headers = { "x-hub-signature-256": signatureOf(Buffer.from(OPENED), SECRET) };
    await fetch(url, { method: "POST", headers, body: OPENED, signal: AbortSignal.timeout(5000) });

    expect(handed).toMatchObject([{ dedupeKey: "github:" }]);
  });
});
