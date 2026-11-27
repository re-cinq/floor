import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { IDLE_CONTEXT } from "./requests.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

describe("folder.list", () => {
  it.each([
    {
      label: "a relative path",
      path: () => "notes",
      reason: () => 'the folder to list must be an absolute path, and "notes" is not',
    },
    {
      label: "an absolute path that does not exist",
      path: (scratchFolder: string) => join(scratchFolder, "missing"),
      reason: (path: string) => `${path} is not a folder on disk`,
    },
    {
      label: "an absolute path to a file",
      path: (scratchFolder: string) => {
        const file = join(scratchFolder, "notes.txt");

        writeFileSync(file, "tides");

        return file;
      },
      reason: (path: string) => `${path} is not a folder on disk`,
    },
  ])("refuses folder.list of $label with its refusal", async ({ path: pathIn, reason }) => {
    await withScratchFolder(async (scratchFolder) => {
      const path = pathIn(scratchFolder);

      expect(await answerFrame(JSON.stringify({ id: "l1", type: "folder.list", path }), IDLE_CONTEXT)).toEqual({
        id: "l1",
        type: "refused",
        reason: reason(path),
      });
    });
  });

  it("lists folders alpha, mango, zebra and files .hidden, notes.md, plan.md by name, sorted, with the scratch folder's parent", async () => {
    await withScratchFolder(async (scratchFolder) => {
      ["mango", "zebra", "alpha"].forEach((folder) => mkdirSync(join(scratchFolder, folder)));
      ["notes.md", "plan.md", ".hidden"].forEach((file) => writeFileSync(join(scratchFolder, file), "tides"));

      expect(await answerFrame(JSON.stringify({ id: "l1", type: "folder.list", path: scratchFolder }), IDLE_CONTEXT)).toEqual({
        id: "l1",
        type: "result",
        result: { path: scratchFolder, parent: dirname(scratchFolder), folders: ["alpha", "mango", "zebra"], files: [".hidden", "notes.md", "plan.md"] },
      });
    });
  });

  it("lists the home folder holding folder sub and file notes.md when no path is given", async () => {
    await withScratchFolder(async (homeFolder) => {
      mkdirSync(join(homeFolder, "sub"));
      writeFileSync(join(homeFolder, "notes.md"), "tides");
      vi.stubEnv("HOME", homeFolder);

      expect(await answerFrame(JSON.stringify({ id: "l1", type: "folder.list" }), IDLE_CONTEXT)).toEqual({
        id: "l1",
        type: "result",
        result: { path: homeFolder, parent: dirname(homeFolder), folders: ["sub"], files: ["notes.md"] },
      });
    });
  });

  it("lists the filesystem root / with no parent", async () => {
    expect(await answerFrame(JSON.stringify({ id: "l1", type: "folder.list", path: "/" }), IDLE_CONTEXT)).toMatchObject({
      id: "l1",
      type: "result",
      result: { path: "/", parent: null },
    });
  });
});

async function withScratchFolder(body: (scratchFolder: string) => Promise<void>) {
  const scratchFolder = mkdtempSync(join(tmpdir(), "folder-list-"));

  try {
    await body(scratchFolder);
  } finally {
    rmSync(scratchFolder, { recursive: true, force: true });
  }
}
