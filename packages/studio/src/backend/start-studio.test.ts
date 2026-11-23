import { afterEach, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../protocol.js";
import { WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { collectionOnDisk, openClient, refusalStatus } from "./studio.fixtures.js";
import { startStudio, type Studio } from "./start-studio.js";

const PAGE = "http://127.0.0.1:4173";
const running: Studio[] = [];

async function started(origins: string[] = []): Promise<Studio> {
  const studio = await startStudio({ dir: collectionOnDisk(WORKER_COLLECTION), port: 0, hostKeys: [], origins });

  running.push(studio);

  return studio;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((studio) => studio.close()));
});

describe("startStudio", () => {
  it("reports a ws url on 127.0.0.1 with the real port, and a token of at least 128 bits in hex", async () => {
    const { url, token } = await started();

    expect({ url: url.replace(/:\d+$/, ":PORT"), port: Number(url.split(":").pop()) > 0, token: /^[0-9a-f]{32,}$/.test(token) }).toEqual({ url: "ws://127.0.0.1:PORT", port: true, token: true });
  });

  it("sends the hello frame with the protocol version when a socket opens", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    expect(await client.next()).toEqual({ type: "hello", version: PROTOCOL_VERSION });
  });

  it("answers collection.read with the view of the collection, under the request's id", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    client.send({ id: "r1", type: "collection.read" });

    expect(await client.nextOfType("result")).toMatchObject({ id: "r1", result: { counts: { lines: 1, agents: 1, refused: 0, problems: 0 }, lines: [{ id: "flow" }] } });
  });

  it("refuses with 401 a socket that carries no token", async () => {
    const { url } = await started();

    expect(await refusalStatus(url, {})).toBe(401);
  });

  it("refuses with 401 a socket whose token is wrong", async () => {
    const { url } = await started();

    expect(await refusalStatus(url, { token: "0".repeat(32) })).toBe(401);
  });

  it("refuses with 403 a socket from a foreign origin, the token right", async () => {
    const { url, token } = await started([PAGE]);

    expect(await refusalStatus(url, { token, origin: "https://evil.example" })).toBe(403);
  });

  it("accepts a socket from an allowed origin with the token", async () => {
    const { url, token } = await started([PAGE]);
    const client = await openClient(url, { token, origin: PAGE });

    expect(await client.next()).toMatchObject({ type: "hello" });
  });

  it("refuses a malformed frame with the reason and keeps the socket open for the next request", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    client.socket.send("{broken");
    client.send({ id: "r2", type: "collection.read" });

    expect([await client.nextOfType("refused"), (await client.nextOfType("result")).id]).toEqual([{ type: "refused", reason: "the frame is not JSON" }, "r2"]);
  });

  it("refuses a request of an unknown type with its id", async () => {
    const { url, token } = await started();
    const client = await openClient(url, { token });

    client.send({ id: "r3", type: "run.start" });

    expect(await client.nextOfType("refused")).toMatchObject({ id: "r3", reason: expect.stringContaining('unknown request type "run.start"') });
  });

  it("closes every open socket when it is closed", async () => {
    const studio = await started();
    const client = await openClient(studio.url, { token: studio.token });
    const closed = new Promise((resolve) => client.socket.once("close", resolve));

    await studio.close();

    await expect(closed).resolves.toBeDefined();
  });

  it("refuses to start on a directory that does not exist", async () => {
    await expect(startStudio({ dir: "/no/such/collection", port: 0, hostKeys: [] })).rejects.toThrow(new Error("/no/such/collection is not a directory"));
  });
});
