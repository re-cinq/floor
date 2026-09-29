// Shared plumbing for the fake HTTP stand-ins: read a request's body whole, answer it, and close the server cleanly.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Answer {
  status: number;
  body: unknown;
}

export interface FakeServer {
  url: string;
  close(): Promise<void>;
}

export async function startFakeServer(handle: (request: IncomingMessage, body: string) => Answer | Promise<Answer>): Promise<FakeServer> {
  const server = createServer((request, response) => {
    void bodyOf(request)
      .then((body) => handle(request, body))
      .then((answer) => response.writeHead(answer.status, { "content-type": "application/json" }).end(JSON.stringify(answer.body)));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  return { url: `http://localhost:${(server.address() as AddressInfo).port}`, close: () => closedServer(server) };
}

function closedServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString();
}
