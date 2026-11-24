import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "publish-packages.sh");
const VERSION = "1.2.3";
const NAME = "@re-cinq/floor-graph";
const PUBLISH_FLAGS = ["--access", "public", "--provenance", "--ignore-scripts"];

const FAKE_NPM = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const scenario = JSON.parse(process.env.FAKE_NPM_SCENARIO);
const [command, target] = process.argv.slice(2);
if (command === "view") {
  const isVersion = target.lastIndexOf("@") > 0;
  const found = isVersion ? scenario.versions.includes(target) : scenario.packages.includes(target);
  process.exit(found ? 0 : 1);
}
if (command === "publish") {
  const call = { cwd: process.cwd(), token: process.env.NODE_AUTH_TOKEN ?? null, args: process.argv.slice(3) };
  appendFileSync(process.env.FAKE_NPM_PUBLISH_LOG, JSON.stringify(call) + "\\n");
  process.exit(0);
}
process.exit(2);
`;

function publishWith({ scenario, token }) {
  const root = mkdtempSync(join(tmpdir(), "publish-packages-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "npm"), FAKE_NPM);
  chmodSync(join(bin, "npm"), 0o755);
  const packageDirectory = join(root, "graph");
  mkdirSync(packageDirectory);
  writeFileSync(join(packageDirectory, "package.json"), JSON.stringify({ name: NAME, version: VERSION }));
  const publishLog = join(root, "calls.jsonl");
  writeFileSync(publishLog, "");

  const result = spawnSync("bash", [SCRIPT, "graph"], {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      VERSION,
      NPM_BOOTSTRAP_TOKEN: token,
      FAKE_NPM_SCENARIO: JSON.stringify(scenario),
      FAKE_NPM_PUBLISH_LOG: publishLog,
    },
  });
  const publishes = readFileSync(publishLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

  return { ...result, publishes, packageDirectory };
}

describe("publish-packages.sh", () => {
  it("skips @re-cinq/floor-graph when 1.2.3 is on the registry already", () => {
    const run = publishWith({ scenario: { versions: [`${NAME}@${VERSION}`], packages: [NAME] }, token: "" });

    assert.equal(run.status, 0);
    assert.match(run.stdout, /@re-cinq\/floor-graph@1\.2\.3 is on the registry already/);
    assert.deepEqual(run.publishes, []);
  });

  it("publishes an existing package from its directory with no NODE_AUTH_TOKEN when the bootstrap token is set", () => {
    const run = publishWith({ scenario: { versions: [], packages: [NAME] }, token: "secret-token" });

    assert.equal(run.status, 0);
    assert.deepEqual(run.publishes, [{ cwd: run.packageDirectory, token: null, args: PUBLISH_FLAGS }]);
  });

  it("exits 1 naming @re-cinq/floor-graph and publishes nothing when a new package has no token", () => {
    const run = publishWith({ scenario: { versions: [], packages: [] }, token: "" });

    assert.equal(run.status, 1);
    assert.match(run.stdout, /::error::@re-cinq\/floor-graph has never been published/);
    assert.deepEqual(run.publishes, []);
  });

  it("publishes a new package with NODE_AUTH_TOKEN equal to the bootstrap token", () => {
    const run = publishWith({ scenario: { versions: [], packages: [] }, token: "secret-token" });

    assert.equal(run.status, 0);
    assert.deepEqual(run.publishes, [{ cwd: run.packageDirectory, token: "secret-token", args: PUBLISH_FLAGS }]);
  });
});
