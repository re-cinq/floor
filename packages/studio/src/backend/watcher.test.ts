import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentMarkdown, lineYaml, WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { collectionOnDisk, openClient, type Client } from "./studio.fixtures.js";
import { startStudio, type Studio } from "./start-studio.js";
import { isWatchedPath } from "./watcher.js";

const running: Studio[] = [];

async function watched(): Promise<{ dir: string; client: Client }> {
  const dir = collectionOnDisk(WORKER_COLLECTION);
  const studio = await startStudio({ dir, port: 0, hostKeys: [] });

  running.push(studio);
  const client = await openClient(studio.url, { token: studio.token });

  await client.nextOfType("hello");

  return { dir, client };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((studio) => studio.close()));
});

describe("isWatchedPath", () => {
  it.each(["flow/assembly-line.yaml", "flow/pipeline.yaml", "flow/agents/worker.md", "flow/agents/worker.extra.md"])("watches %s, a path the collection reads", (path) => {
    expect(isWatchedPath(path)).toBe(true);
  });

  it.each(["flow/notes.md", "README.md", ".floor-studio/runs/one.md", ".git/config", "flow/.hidden/agents/worker.md", "flow"])("ignores %s", (path) => {
    expect(isWatchedPath(path)).toBe(false);
  });
});

describe("a change on disk", () => {
  it("pushes a collection frame with the new prompt when an agent file is edited", async () => {
    const { dir, client } = await watched();

    writeFileSync(join(dir, "flow/agents/worker.md"), agentMarkdown("Work {ticket} twice."));

    expect(await client.nextOfType("collection")).toMatchObject({ collection: { agents: [{ name: "worker", prompt: "Work {ticket} twice.\n" }] } });
  });

  it("pushes a collection frame with the new agent when an agent file is added", async () => {
    const { dir, client } = await watched();

    writeFileSync(join(dir, "flow/agents/helper.md"), agentMarkdown("Help."));

    expect(await client.nextOfType("collection")).toMatchObject({ collection: { counts: { agents: 2 } } });
  });

  it("pushes a collection frame whose line has a problem when its agent file is deleted", async () => {
    const { dir, client } = await watched();

    rmSync(join(dir, "flow/agents/worker.md"));

    expect(await client.nextOfType("collection")).toMatchObject({ collection: { counts: { agents: 0, problems: 1 } } });
  });

  it("pushes the last state, not an earlier one, for a line file rewritten in several writes", async () => {
    const { dir, client } = await watched();
    const line = join(dir, "flow/assembly-line.yaml");

    writeFileSync(line, lineYaml("flow", "worker"));
    writeFileSync(line, lineYaml("flow", "worker"));
    writeFileSync(line, lineYaml("flow", "worker").replace("Works the ticket.", "Works it."));

    expect(await client.nextOfType("collection")).toMatchObject({ collection: { lines: [{ nodes: [{ description: "Works it." }, { id: "done" }] }] } });
  });

  it("pushes a refused frame without an id, naming ENOENT, when the collection folder is deleted after the first read", async () => {
    const { dir, client } = await watched();

    rmSync(dir, { recursive: true });

    expect(await client.nextOfType("refused")).toEqual({ type: "refused", reason: expect.stringContaining("ENOENT") });
  });
});
