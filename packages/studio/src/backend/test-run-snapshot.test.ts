import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentMarkdown, WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { collectionOnDisk } from "./studio.fixtures.js";
import { snapshotCollection } from "./test-run-snapshot.js";

const WORKER_PATH = "flow/agents/worker.md";

describe("snapshotCollection", () => {
  const folders: string[] = [];

  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  function setUp(files: Parameters<typeof collectionOnDisk>[0]): { collectionDir: string; runFolder: string } {
    const collectionDir = collectionOnDisk(files);
    const runFolder = mkdtempSync(join(tmpdir(), "floor-test-run-snapshot-"));

    folders.push(collectionDir, runFolder);

    return { collectionDir, runFolder };
  }

  it("keeps worker.md as it was at the snapshot when the collection's copy is rewritten afterwards", async () => {
    const { collectionDir, runFolder } = setUp(WORKER_COLLECTION);

    await snapshotCollection(collectionDir, runFolder);
    writeFileSync(join(collectionDir, WORKER_PATH), agentMarkdown("Rework {ticket} after the snapshot."));

    expect(readFileSync(join(runFolder, "definitions", WORKER_PATH), "utf8")).toEqual(WORKER_COLLECTION.find((file) => file.path === WORKER_PATH)?.text);
  });

  it("copies floor-collection.yaml, the flow line and its worker agent, and leaves .floor-studio and docs behind", async () => {
    const { collectionDir, runFolder } = setUp([
      ...WORKER_COLLECTION,
      { path: "floor-collection.yaml", text: "host_keys: []\n" },
      { path: ".floor-studio/runs/old.json", text: "{}" },
      { path: "docs/notes.md", text: "# notes" },
    ]);

    const copied = await snapshotCollection(collectionDir, runFolder);
    const definitions = join(runFolder, "definitions");
    const onDisk = readdirSync(definitions, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(definitions, join(entry.parentPath, entry.name)).split(sep).join("/"))
      .sort();
    const expected = ["floor-collection.yaml", "flow/agents/worker.md", "flow/assembly-line.yaml"];

    expect({ copied, onDisk }).toEqual({ copied: expected, onDisk: expected });
  });
});
