import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const isDirectoryOrManifest = (source) => !source.includes("node_modules") && (!basename(source).includes(".") || basename(source) === "package.json");

function copyOfManifests() {
  const root = mkdtempSync(join(tmpdir(), "release-version-"));
  mkdirSync(join(root, "scripts"));
  cpSync(join(REPOSITORY, "scripts", "release-version.sh"), join(root, "scripts", "release-version.sh"));
  cpSync(join(REPOSITORY, "package.json"), join(root, "package.json"));

  for (const workspaces of ["packages", "apps"]) {
    cpSync(join(REPOSITORY, workspaces), join(root, workspaces), { recursive: true, filter: isDirectoryOrManifest });
  }

  return root;
}

function releaseVersion(root, ...args) {
  return spawnSync("bash", [join(root, "scripts", "release-version.sh"), ...args], { cwd: root, encoding: "utf8" });
}

const manifestOf = (root, path) => JSON.parse(readFileSync(join(root, path, "package.json"), "utf8"));

describe("release-version.sh", () => {
  it("stamps 1.2.3 into packages/graph and prints it for the tag v1.2.3", () => {
    const root = copyOfManifests();

    const run = releaseVersion(root, "v1.2.3");

    assert.equal(run.status, 0);
    assert.equal(run.stdout.trim(), "1.2.3");
    assert.equal(manifestOf(root, "packages/graph").version, "1.2.3");
  });

  it("pins every @re-cinq/floor- dependency of packages/pipeline to 1.2.3 for the tag v1.2.3", () => {
    const root = copyOfManifests();

    releaseVersion(root, "v1.2.3");

    const floorDependencies = Object.entries(manifestOf(root, "packages/pipeline").dependencies).filter(([name]) => name.startsWith("@re-cinq/floor-"));
    assert.deepEqual(floorDependencies.map(([, range]) => range), floorDependencies.map(() => "1.2.3"));
  });

  it("prints 1.2.3 and leaves packages/graph at its placeholder for --check v1.2.3", () => {
    const root = copyOfManifests();
    const placeholder = manifestOf(root, "packages/graph").version;

    const run = releaseVersion(root, "--check", "v1.2.3");

    assert.equal(run.status, 0);
    assert.equal(run.stdout.trim(), "1.2.3");
    assert.equal(manifestOf(root, "packages/graph").version, placeholder);
  });

  it("exits 1 naming the tag for --check v1.2.3-rc.1", () => {
    const run = releaseVersion(copyOfManifests(), "--check", "v1.2.3-rc.1");

    assert.equal(run.status, 1);
    assert.match(run.stderr, /'v1\.2\.3-rc\.1' is not a release tag/);
  });

  it("exits 1 for --check latest, a tag without the v prefix and digits", () => {
    const run = releaseVersion(copyOfManifests(), "--check", "latest");

    assert.equal(run.status, 1);
  });

  it("prints the seven published package directories in dependency order, packages/studio last, for --list", () => {
    const run = releaseVersion(REPOSITORY, "--list");

    const listed = run.stdout.trim();

    assert.equal(run.status, 0);
    assert.deepEqual(listed.split("\n"), ["packages/contracts", "packages/assembly-lines", "packages/graph", "packages/client", "packages/station", "packages/pipeline", "packages/studio"]);
  });

  it("stamps 1.2.3 into packages/studio and pins its @re-cinq/floor-graph to 1.2.3 for the tag v1.2.3", () => {
    const root = copyOfManifests();

    releaseVersion(root, "v1.2.3");

    assert.deepEqual([manifestOf(root, "packages/studio").version, manifestOf(root, "packages/studio").dependencies["@re-cinq/floor-graph"]], ["1.2.3", "1.2.3"]);
  });
});

