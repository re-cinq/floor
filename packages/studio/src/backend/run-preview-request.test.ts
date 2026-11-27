import { rmSync } from "node:fs";
import { Refusal } from "@re-cinq/floor-assembly-lines";
import { describe, expect, it } from "vitest";
import { agentMarkdown, WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { collectionView } from "./collection-view.js";
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

describe("previewOf station", () => {
  const RESULT_REQUIRED_COLLECTION = WORKER_COLLECTION.map((file) => (file.path === "flow/assembly-line.yaml" ? { ...file, text: file.text.replace("    kind: agent\n", "    kind: agent\n    result_required: true\n") } : file));

  it.each([
    { stationFile: "says result_required: true", files: RESULT_REQUIRED_COLLECTION, resultRequired: true },
    { stationFile: "says nothing of a result", files: WORKER_COLLECTION, resultRequired: undefined },
  ])("previews flow/work with resultRequired $resultRequired when its station $stationFile", async ({ files, resultRequired }) => {
    const { station } = await previewOf(collectionView(files, []), { line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder: "/tmp/run-1", permission: "acceptEdits" });

    expect({ kind: station.kind, resultRequired: station.resultRequired }).toEqual({ kind: "agent", resultRequired });
  });
});
