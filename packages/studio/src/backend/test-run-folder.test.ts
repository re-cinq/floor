import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Refusal } from "@re-cinq/floor-assembly-lines";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRunFolder } from "./test-run-folder.js";

const RUN_NAME = "review-loop-20261127-141230";

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

  it("refuses review-loop-20261127-141230 when that folder exists, and leaves its run.json as it was", async () => {
    const workspace = mkdtempSync(join(scratch, "existing-"));
    const existing = join(workspace, RUN_NAME);
    mkdirSync(existing);
    writeFileSync(join(existing, "run.json"), '{"keep":"me"}');

    const refusal = await createRunFolder(workspace, RUN_NAME).catch((error: Error) => error.message);

    expect({ refusal, kept: readFileSync(join(existing, "run.json"), "utf8") }).toEqual({
      refusal: `${existing} already exists, and a test run never reuses a folder`,
      kept: '{"keep":"me"}',
    });
  });

  it("creates review-loop-20261127-141230 inside the workspace and answers its path", async () => {
    const workspace = mkdtempSync(join(scratch, "empty-"));

    const path = await createRunFolder(workspace, RUN_NAME);

    expect({ path, isFolder: statSync(path).isDirectory() }).toEqual({ path: join(workspace, RUN_NAME), isFolder: true });
  });
});
