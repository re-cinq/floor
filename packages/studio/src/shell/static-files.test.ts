import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentTypeOf, startPageServer, type PageServer } from "./static-files.js";

const running: PageServer[] = [];

function pageFolder(): string {
  const root = mkdtempSync(join(tmpdir(), "floor-studio-page-"));

  mkdirSync(join(root, "dist/web/assets"), { recursive: true });
  writeFileSync(join(root, "dist/web/index.html"), "<h1>studio</h1>");
  writeFileSync(join(root, "dist/web/assets/app.js"), "export {};");
  writeFileSync(join(root, "secret.txt"), "outside the page");

  return root;
}

async function serving(root: string): Promise<PageServer> {
  const server = await startPageServer(join(root, "dist/web"));

  running.push(server);

  return server;
}

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function rawGet(origin: string, path: string, method = "GET"): Promise<Answer> {
  const { port } = new URL(origin);

  return new Promise((resolve, reject) => {
    const sent = request({ host: "127.0.0.1", port, path, method }, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });

    sent.on("error", reject);
    sent.end();
  });
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

describe("contentTypeOf", () => {
  it.each([
    ["index.html", "text/html; charset=utf-8"],
    ["assets/app.js", "text/javascript; charset=utf-8"],
    ["app.css", "text/css; charset=utf-8"],
    ["data.json", "application/json; charset=utf-8"],
    ["logo.svg", "image/svg+xml"],
    ["font.woff2", "font/woff2"],
    ["something.bin", "application/octet-stream"],
  ])("answers %s as %s", (path, type) => {
    expect(contentTypeOf(path)).toBe(type);
  });
});

describe("startPageServer", () => {
  it("serves index.html at the root, with its content type and no caching", async () => {
    const { origin } = await serving(pageFolder());

    expect(await rawGet(origin, "/")).toMatchObject({ status: 200, body: "<h1>studio</h1>", headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  });

  it("serves a file in a folder with the type its name says", async () => {
    const { origin } = await serving(pageFolder());

    expect(await rawGet(origin, "/assets/app.js")).toMatchObject({ status: 200, body: "export {};", headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
  });

  it("answers 404 for a file that is not there", async () => {
    const { origin } = await serving(pageFolder());

    expect(await rawGet(origin, "/nope.js")).toMatchObject({ status: 404 });
  });

  it.each(["/../secret.txt", "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt", "/assets/..%2f..%2f..%2fsecret.txt", "/%2e%2e%2f%2e%2e%2fsecret.txt"])("does not serve a file outside the page folder for %s", async (path) => {
    const { origin } = await serving(pageFolder());

    expect((await rawGet(origin, path)).body).not.toContain("outside the page");
  });

  it("answers 400 for a path with a broken percent escape", async () => {
    const { origin } = await serving(pageFolder());

    expect(await rawGet(origin, "/%E0%A4%A")).toMatchObject({ status: 400 });
  });

  it("does not serve a symlink inside the page folder that points outside it", async () => {
    const root = pageFolder();

    symlinkSync(join(root, "secret.txt"), join(root, "dist/web/leak.txt"));
    const { origin } = await serving(root);

    expect((await rawGet(origin, "/leak.txt")).status).toBe(404);
  });

  it("answers 405 for a method that writes", async () => {
    const { origin } = await serving(pageFolder());

    expect(await rawGet(origin, "/", "POST")).toMatchObject({ status: 405 });
  });

  it("answers a plain page saying the page is not built when the folder does not exist", async () => {
    const root = mkdtempSync(join(tmpdir(), "floor-studio-page-"));
    const { origin } = await serving(root);

    expect(await rawGet(origin, "/")).toMatchObject({ status: 503, body: expect.stringContaining("The page is not built"), headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  });

  it("listens on 127.0.0.1 and reports its origin", async () => {
    const { origin } = await serving(pageFolder());

    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
