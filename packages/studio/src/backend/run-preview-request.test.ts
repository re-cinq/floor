import { rmSync } from "node:fs";
import { Refusal } from "@re-cinq/floor-assembly-lines";
import { describe, expect, it } from "vitest";
import { agentMarkdown, WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { readCollectionView } from "./read-collection-view.js";
import { previewOf } from "./run-preview-request.js";
import { collectionOnDisk } from "./studio.fixtures.js";

describe("previewOf", () => {
  it("refuses to preview flow/ghost with 'line flow has no node ghost' when the handed collection has only work", async () => {
    const dir = collectionOnDisk(WORKER_COLLECTION);

    try {
      const view = await readCollectionView(dir, []);

      await expect(previewOf(view, { line: "flow", node: "ghost", fixture: {}, folder: "/tmp/run-1", permission: "acceptEdits" })).rejects.toThrow(new Refusal("line flow has no node ghost"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders 'Rework ENG-1 from the snapshot.' for flow/work with ticket ENG-1 when the handed collection's worker prompt says so", async () => {
    const dir = collectionOnDisk(WORKER_COLLECTION.map((file) => (file.path === "flow/agents/worker.md" ? { ...file, text: agentMarkdown("Rework {ticket} from the snapshot.") } : file)));

    try {
      const view = await readCollectionView(dir, []);

      await expect(previewOf(view, { line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder: "/tmp/run-1", permission: "acceptEdits" })).resolves.toMatchObject({ preview: { prompt: "Rework ENG-1 from the snapshot.", blockers: [] } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
