import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WORKER_COLLECTION } from "../backend/collection-view.fixtures.js";
import { collectionOnDisk, openClient } from "../backend/studio.fixtures.js";
import { studioCommand, USAGE, type RunningStudio, type Shell } from "./studio-command.js";

const WAIT_MS = 5000;
const running: RunningStudio[] = [];

async function startedStudio(argv: string[], shell: Shell) {
  const outcome = await studioCommand(argv, shell);

  if (!("running" in outcome)) throw new Error("the studio did not start");
  running.push(outcome.running);
  const { hash, origin } = new URL(outcome.running.pageUrl);

  return { running: outcome.running, origin, fragment: new URLSearchParams(hash.slice(1)) };
}

function collected() {
  const out: string[] = [];
  const err: string[] = [];

  return { out, err, shell: { out: (line: string) => out.push(line), err: (line: string) => err.push(line), pageDir: join(tmpdir(), "no-built-page-here"), openBrowser: () => undefined, pageWaitMs: 3000 } };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((studio) => studio.close()));
});

describe("studioCommand", () => {
  it("prints the usage and exits 0 for --help", async () => {
    const { out, shell } = collected();

    expect([await studioCommand(["--help"], shell), out]).toEqual([{ exitCode: 0 }, [USAGE]]);
  });

  it("prints the reason and the usage to stderr and exits 2 for a bad argument", async () => {
    const { err, out, shell } = collected();

    expect([await studioCommand(["--port", "x"], shell), out, err]).toEqual([{ exitCode: 2 }, [], ["floor-studio: --port needs a whole number from 0 to 65535", USAGE]]);
  });

  it("prints the reason and exits 1 for a directory that does not exist", async () => {
    const { err, shell } = collected();

    expect([await studioCommand(["/no/such/collection", "--no-open"], shell), err]).toEqual([{ exitCode: 1 }, ["floor-studio: /no/such/collection is not a directory"]]);
  });

  it("starts the backend and the page, prints one line with the page url, and carries the socket and token in the fragment", async () => {
    const { out, shell } = collected();
    const { running: started, fragment, origin } = await startedStudio([collectionOnDisk(WORKER_COLLECTION), "--no-open"], shell);

    expect({ lines: out.length, printed: out[0], origin: origin.startsWith("http://127.0.0.1:"), keys: [...fragment.keys()], socket: fragment.get("socket")?.startsWith("ws://127.0.0.1:") }).toEqual({
      lines: 1,
      printed: `floor-studio: ${started.pageUrl}`,
      origin: true,
      keys: ["socket", "token"],
      socket: true,
    });
  });

  it("lets the page, and no other origin, open the socket with the token from the fragment", async () => {
    const { fragment, origin } = await startedStudio([collectionOnDisk(WORKER_COLLECTION), "--no-open", "--host-key", "review_required"], collected().shell);
    const client = await openClient(fragment.get("socket") ?? "", { token: fragment.get("token") ?? "", origin });

    expect(await client.next()).toMatchObject({ type: "hello" });
  });

  it("lets a page shown at localhost on the page port open the socket", async () => {
    const { fragment, origin } = await startedStudio([collectionOnDisk(WORKER_COLLECTION), "--no-open"], collected().shell);
    const client = await openClient(fragment.get("socket") ?? "", { token: fragment.get("token") ?? "", origin: `http://localhost:${new URL(origin).port}` });

    expect(await client.next()).toMatchObject({ type: "hello" });
  });

  it("opens the page url in the browser once after 300ms when no page connected", async () => {
    const opened: string[] = [];
    const shell = { ...collected().shell, openBrowser: (url: string) => void opened.push(url), pageWaitMs: 300 };
    const { running: started } = await startedStudio([collectionOnDisk(WORKER_COLLECTION)], shell);

    await new Promise((done) => setTimeout(done, 600));

    expect(opened).toEqual([started.pageUrl]);
  });

  it("does not open the browser when a page connected within the 300ms wait", async () => {
    const opened: string[] = [];
    const shell = { ...collected().shell, openBrowser: (url: string) => void opened.push(url), pageWaitMs: 300 };
    const { fragment, origin } = await startedStudio([collectionOnDisk(WORKER_COLLECTION)], shell);
    const client = await openClient(fragment.get("socket") ?? "", { token: fragment.get("token") ?? "", origin });

    await client.next();
    await new Promise((done) => setTimeout(done, 600));

    expect(opened).toEqual([]);
  });

  it("serves the built page from its folder at the page url", async () => {
    const pageDir = mkdtempSync(join(tmpdir(), "floor-studio-built-"));

    writeFileSync(join(pageDir, "index.html"), "<h1>built</h1>");
    const { running: started } = await startedStudio([collectionOnDisk(WORKER_COLLECTION), "--no-open"], { ...collected().shell, pageDir });

    expect(await (await fetch(started.pageUrl, { signal: AbortSignal.timeout(WAIT_MS) })).text()).toBe("<h1>built</h1>");
  });
});
