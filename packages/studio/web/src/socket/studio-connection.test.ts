import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import { collectionView } from "../../../src/backend/collection-view";
import { WORKER_COLLECTION, lineYaml } from "../../../src/backend/collection-view.fixtures";
import { collectionOnDisk } from "../../../src/backend/studio.fixtures";
import { startStudio, type Studio } from "../../../src/backend/start-studio";
import { PROTOCOL_VERSION } from "../../../src/protocol";
import { StudioConnection, type StudioSnapshot } from "./studio-connection";

const SOON = () => 20;
const stoppers: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  await Promise.all(stoppers.splice(0).map((stop) => stop()));
});

async function studioOnDisk(): Promise<{ studio: Studio; dir: string }> {
  const dir = collectionOnDisk(WORKER_COLLECTION);
  const studio = await startStudio({ dir, port: 0, hostKeys: [], origins: [] });

  stoppers.push(() => studio.close());

  return { studio, dir };
}

function connected(options: { socket: string; token: string }): StudioConnection {
  const connection = new StudioConnection({ ...options, retryDelay: SOON });

  stoppers.push(() => connection.close());
  connection.start();

  return connection;
}

/** Resolves with the first snapshot the connection reaches that the test accepts. */
function reaches(connection: StudioConnection, accepts: (snapshot: StudioSnapshot) => boolean): Promise<StudioSnapshot> {
  return new Promise((resolve, reject) => {
    const giveUp = setTimeout(() => reject(new Error(`never reached: ${JSON.stringify(connection.snapshot().connection)}`)), 5000);
    const check = () => {
      if (!accepts(connection.snapshot())) return;
      clearTimeout(giveUp);
      unsubscribe();
      resolve(connection.snapshot());
    };
    const unsubscribe = connection.subscribe(check);

    check();
  });
}

interface ServedProtocol {
  address: string;
  sockets: Set<ServerSocket>;
  reads: () => number;
}

/** A real WebSocket server that speaks the protocol by hand, so a test can drop its sockets or send what the backend never would. */
async function protocolServer(onConnection: (socket: ServerSocket, served: ServedProtocol) => void): Promise<ServedProtocol> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const served: ServedProtocol = { address: "", sockets: new Set(), reads: () => 0 };
  let reads = 0;

  await new Promise<void>((resolve) => server.on("listening", resolve));
  served.address = `ws://127.0.0.1:${(server.address() as { port: number }).port}`;
  served.reads = () => reads;
  server.on("connection", (socket) => {
    served.sockets.add(socket);
    socket.on("message", () => (reads += 1));
    onConnection(socket, served);
  });
  stoppers.push(() => new Promise<void>((resolve) => { server.clients.forEach((socket) => socket.terminate()); server.close(() => resolve()); }));

  return served;
}

const hello = JSON.stringify({ type: "hello", version: PROTOCOL_VERSION });

describe("StudioConnection against the real backend", () => {
  it("opens, asks for the collection and holds its view", async () => {
    const { studio } = await studioOnDisk();
    const connection = connected({ socket: studio.url, token: studio.token });

    const snapshot = await reaches(connection, ({ collection }) => collection !== null);

    expect({ status: snapshot.connection.status, lines: snapshot.collection?.lines.map(({ id }) => id), counts: snapshot.collection?.counts }).toEqual({
      status: "open",
      lines: ["flow"],
      counts: { lines: 1, agents: 1, refused: 0, problems: 0 },
    });
  });

  it("starts out connecting, with no collection yet", async () => {
    const { studio } = await studioOnDisk();
    const connection = connected({ socket: studio.url, token: studio.token });

    expect(connection.snapshot()).toEqual({ connection: { status: "connecting" }, collection: null, readError: null });
  });

  it("replaces the collection when a file changes on disk, without being asked", async () => {
    const { studio, dir } = await studioOnDisk();
    const connection = connected({ socket: studio.url, token: studio.token });

    await reaches(connection, ({ collection }) => collection !== null);
    mkdirSync(join(dir, "second"));
    writeFileSync(join(dir, "second", "assembly-line.yaml"), lineYaml("second", "worker"));
    const snapshot = await reaches(connection, ({ collection }) => collection?.lines.length === 2);

    expect(snapshot.collection?.lines.map(({ id }) => id)).toEqual(["flow", "second"]);
  });

  it("reports a refused upgrade as refused, with the reason, and stops trying", async () => {
    const { studio } = await studioOnDisk();
    const connection = connected({ socket: studio.url, token: "not-the-token" });

    const snapshot = await reaches(connection, ({ connection: state }) => state.status === "refused");

    expect(snapshot.connection).toEqual({ status: "refused", reason: expect.stringContaining("token") });
  });

  it("reports an address nothing listens on as closed and still retrying", async () => {
    const { studio } = await studioOnDisk();
    const { url, token } = studio;

    await studio.close();
    const connection = connected({ socket: url, token });
    const snapshot = await reaches(connection, ({ connection: state }) => state.status === "closed");

    expect(snapshot.connection).toEqual({ status: "closed", reason: expect.stringContaining("reach"), retrying: true });
  });

  it("reports a socket address that is not one as closed, not retrying", async () => {
    const connection = connected({ socket: "not an address", token: "abc" });

    const snapshot = await reaches(connection, ({ connection: state }) => state.status === "closed");

    expect(snapshot.connection).toEqual({ status: "closed", reason: expect.stringContaining("not a valid"), retrying: false });
  });

  it("stops for good once closed by the page", async () => {
    const { studio } = await studioOnDisk();
    const connection = connected({ socket: studio.url, token: studio.token });

    await reaches(connection, ({ collection }) => collection !== null);
    connection.close();

    expect(connection.snapshot().connection).toEqual({ status: "closed", reason: "closed by the page", retrying: false });
  });
});

describe("StudioConnection against a server that speaks the protocol by hand", () => {
  it("reconnects after a drop and reads the collection again", async () => {
    const view = collectionView(WORKER_COLLECTION, []);
    const served = await protocolServer((socket) => {
      socket.send(hello);
      socket.on("message", (raw) => {
        const { id } = JSON.parse(raw.toString()) as { id: string };

        socket.send(JSON.stringify({ id, type: "result", result: view }));
      });
    });
    const connection = connected({ socket: served.address, token: "abc" });

    await reaches(connection, ({ collection }) => collection !== null);
    served.sockets.forEach((socket) => socket.terminate());
    await reaches(connection, ({ connection: state }) => state.status === "closed");
    await reaches(connection, ({ connection: state }) => state.status === "open");
    await reaches(connection, () => served.reads() === 2);

    expect(served.reads()).toBe(2);
  });

  it("gives each answer to the request that has its id, whatever the order they come back in", async () => {
    const served = await protocolServer((socket) => {
      // The first request is the page's own read of the collection; the two the test makes come after it.
      const asked: string[] = [];

      socket.send(hello);
      socket.on("message", (raw) => {
        asked.push((JSON.parse(raw.toString()) as { id: string }).id);
        if (asked.length < 3) return;
        asked.slice(1).reverse().forEach((id, order) => socket.send(JSON.stringify({ id, type: "result", result: { answeredAs: order } })));
      });
    });
    const connection = connected({ socket: served.address, token: "abc" });

    await reaches(connection, ({ connection: state }) => state.status === "open");
    const [first, second] = await Promise.all([connection.request("collection.read"), connection.request("collection.read")]);

    expect([first, second]).toEqual([{ answeredAs: 1 }, { answeredAs: 0 }]);
  });

  it("rejects a request the backend refuses, with its reason", async () => {
    const served = await protocolServer((socket) => {
      socket.send(hello);
      socket.on("message", (raw) => socket.send(JSON.stringify({ id: (JSON.parse(raw.toString()) as { id: string }).id, type: "refused", reason: "the folder is gone" })));
    });
    const connection = connected({ socket: served.address, token: "abc" });

    await reaches(connection, ({ connection: state }) => state.status === "open");

    await expect(connection.request("collection.read")).rejects.toThrow(new Error("the folder is gone"));
  });

  it("stops, saying why, when the backend sends a frame the protocol does not know", async () => {
    const served = await protocolServer((socket) => socket.send(JSON.stringify({ type: "surprise" })));
    const connection = connected({ socket: served.address, token: "abc" });

    const snapshot = await reaches(connection, ({ connection: state }) => state.status === "closed");

    expect(snapshot.connection).toEqual({ status: "closed", reason: expect.stringContaining("cannot read"), retrying: false });
  });

  it("is refused, naming both versions, when the backend speaks another protocol version", async () => {
    const served = await protocolServer((socket) => socket.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION + 1 })));
    const connection = connected({ socket: served.address, token: "abc" });

    const snapshot = await reaches(connection, ({ connection: state }) => state.status === "refused");

    expect(snapshot.connection).toEqual({ status: "refused", reason: `the studio speaks protocol ${PROTOCOL_VERSION + 1} and this page speaks ${PROTOCOL_VERSION}` });
  });
});
