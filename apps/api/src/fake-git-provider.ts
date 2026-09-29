// A stand-in for a git credential provider for the tests, over real HTTP: it notes what it was asked and by whom, and knows one repository it will not give a credential for.
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

export const REFUSED_REPO_URL = "https://github.com/re-cinq/refused";
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

export interface AskedOfProvider {
  authorization: string;
  repoUrl: string;
  access: string;
}

export interface FakeGitProvider {
  url: string;
  asked: AskedOfProvider[];
  close(): Promise<void>;
}

export async function startFakeGitProvider(): Promise<FakeGitProvider> {
  const asked: AskedOfProvider[] = [];
  const server = createServer((request, response) => {
    void askedIn(request).then((asking) => {
      asked.push(asking);
      const refused = asking.repoUrl === REFUSED_REPO_URL;
      const body = refused ? { error: "unknown repository" } : { username: "x-access-token", password: `ghs_${asking.access}` };

      response.writeHead(refused ? HTTP_NOT_FOUND : HTTP_OK, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}/git-credentials`,
    asked,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function askedIn(request: IncomingMessage): Promise<AskedOfProvider> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString()) as { repoUrl: string; access: string };

  return { authorization: request.headers.authorization ?? "", repoUrl: body.repoUrl, access: body.access };
}
