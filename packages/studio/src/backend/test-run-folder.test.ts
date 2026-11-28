import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Refusal } from "@re-cinq/floor-assembly-lines";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRunFolder } from "./test-run-folder.js";

const RUN_NAME = "review-loop-20261127-141230";

async function createdFolder(workspace: string): Promise<{ path: string; isFolder: boolean }> {
  const path = await createRunFolder(workspace, RUN_NAME);

  return { path, isFolder: statSync(path).isDirectory() };
}

describe("createRunFolder", () => {
  let scratch: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "floor-test-run-folder-"));
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const relativePathRefusal = (workspace: string) => `the workspace folder must be an absolute path, and ${JSON.stringify(workspace)} is not`;
  const missingFolderRefusal = (workspace: string) => `the workspace folder ${workspace} is not a folder on disk`;

  it.each([
    { workspace: () => "runs", why: "it is not an absolute path", message: () => relativePathRefusal("runs") },
    { workspace: () => "", why: "it is not an absolute path", message: () => relativePathRefusal("") },
    { workspace: () => join(scratch, "missing"), why: "it does not exist", message: () => missingFolderRefusal(join(scratch, "missing")) },
    {
      workspace: () => {
        const file = join(scratch, "plain-file");
        writeFileSync(file, "");

        return file;
      },
      why: "it is a file",
      message: () => missingFolderRefusal(join(scratch, "plain-file")),
    },
  ])("refuses a workspace when $why", async ({ workspace, message }) => {
    await expect(createRunFolder(workspace(), RUN_NAME)).rejects.toThrow(new Refusal(message()));
  });

  it("creates review-loop-20261127-141230-2 when review-loop-20261127-141230 exists, and leaves its run.json as it was", async () => {
    const workspace = mkdtempSync(join(scratch, "existing-"));
    const existing = join(workspace, RUN_NAME);
    mkdirSync(existing);
    writeFileSync(join(existing, "run.json"), '{"keep":"me"}');

    const path = await createRunFolder(workspace, RUN_NAME);

    expect({ path, isFolder: statSync(path).isDirectory(), kept: readFileSync(join(existing, "run.json"), "utf8") }).toEqual({
      path: join(workspace, `${RUN_NAME}-2`),
      isFolder: true,
      kept: '{"keep":"me"}',
    });
  });

  it("creates review-loop-20261127-141230-3 when review-loop-20261127-141230 and review-loop-20261127-141230-2 exist", async () => {
    const workspace = mkdtempSync(join(scratch, "taken-twice-"));
    mkdirSync(join(workspace, RUN_NAME));
    mkdirSync(join(workspace, `${RUN_NAME}-2`));

    expect(await createdFolder(workspace)).toEqual({ path: join(workspace, `${RUN_NAME}-3`), isFolder: true });
  });

  it("rejects with EACCES and creates nothing when the workspace is read-only", async () => {
    const workspace = mkdtempSync(join(scratch, "read-only-"));
    chmodSync(workspace, 0o555);

    try {
      const failure = await createRunFolder(workspace, RUN_NAME).catch((error: NodeJS.ErrnoException) => error);

      expect({ code: (failure as NodeJS.ErrnoException).code, entries: readdirSync(workspace) }).toEqual({ code: "EACCES", entries: [] });
    } finally {
      chmodSync(workspace, 0o755);
    }
  }, 5_000);

  it("creates review-loop-20261127-141230 inside the workspace and answers its path", async () => {
    const workspace = mkdtempSync(join(scratch, "empty-"));

    expect(await createdFolder(workspace)).toEqual({ path: join(workspace, RUN_NAME), isFolder: true });
  });
});
