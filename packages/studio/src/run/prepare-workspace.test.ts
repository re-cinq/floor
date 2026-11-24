import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareWorkspace } from "./prepare-workspace.js";

describe("prepareWorkspace", () => {
  let root = "";

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("copies plan.md into a nested folder and symlinks the repo checkout", async () => {
    root = mkdtempSync(join(tmpdir(), "prepare-workspace-"));
    const source = join(root, "source");
    const run = join(root, "run");
    mkdirSync(join(source, "repo"), { recursive: true });
    writeFileSync(join(source, "plan.md"), "the plan");
    writeFileSync(join(source, "repo", "README.md"), "readme");

    await prepareWorkspace({
      copies: [{ need: "plan", from: join(source, "plan.md"), to: join(run, "inputs", "plan.md") }],
      links: [{ need: "repo", from: join(source, "repo"), to: join(run, "target") }],
    });

    expect({
      plan: readFileSync(join(run, "inputs", "plan.md"), "utf8"),
      linked: lstatSync(join(run, "target")).isSymbolicLink(),
      readme: existsSync(join(run, "target", "README.md")),
    }).toEqual({ plan: "the plan", linked: true, readme: true });
  });
});
