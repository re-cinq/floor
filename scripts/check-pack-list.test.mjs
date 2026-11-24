import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const CHECK = join(dirname(fileURLToPath(import.meta.url)), "check-pack-list.mjs");

function packageWith(manifest, files) {
  const directory = mkdtempSync(join(tmpdir(), "pack-list-"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@re-cinq/floor-demo", version: "0.0.0", files: ["dist"], ...manifest }));

  for (const file of ["README.md", "LICENSE", ...files]) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), "x");
  }

  return directory;
}

const checked = (directory) => spawnSync("node", [CHECK, directory], { encoding: "utf8" });

describe("check-pack-list.mjs", () => {
  it("passes a package with no dist/index.js whose ./backend export and bin are packed", () => {
    const directory = packageWith({ exports: { "./backend": { types: "./dist/backend/index.d.ts", default: "./dist/backend/index.js" } }, bin: { demo: "dist/cli.js" } }, ["dist/backend/index.js", "dist/backend/index.d.ts", "dist/cli.js"]);

    assert.equal(checked(directory).status, 0);
  });

  it("names dist/backend/index.js as missing when the ./backend export is not packed", () => {
    const directory = packageWith({ exports: { "./backend": { types: "./dist/backend/index.d.ts", default: "./dist/backend/index.js" } } }, ["dist/backend/index.d.ts"]);

    assert.deepEqual([checked(directory).status, checked(directory).stderr.trim()], [1, "@re-cinq/floor-demo: dist/backend/index.js is missing"]);
  });
});
