import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exampleFence, runExampleTests, renderSdkPages } from "../build.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { stableVersion, packageIntro } from "../release.mjs";
import { fillTemplate } from "../template.mjs";

test("an unknown template token names the missing substitution", () => {
  assert.throws(() => fillTemplate("{{missing}}", {}), /Unknown SDK page token: missing/);
});

test("a prerelease cannot label the stable SDK documentation", () => {
  assert.throws(() => stableVersion("1.0.0-beta.1"), /Unexpected npm release: 1.0.0-beta.1/);
});

test("a package without a package introduction cannot render its page", () => {
  assert.throws(() => packageIntro("export const version = 1;"), /SDK needs a package introduction/);
});

test("the contracts build renders only sdk/contracts.md when no tutorial is supplied", async () => {
  const rendered = [];
  await renderSdkPages({ name: "contracts", reference: "Report" }, (...args) => rendered.push(args));
  assert.deepEqual(rendered, [["page.md", "sdk/contracts.md", "\nReport"]]);
});

test("SDK examples render TS, TSX, CSS, and MTS with their Markdown languages", () => {
  for (const [file, language] of [["hello.ts", "ts"], ["App.tsx", "tsx"], ["graph.css", "css"], ["run.mts", "ts"]]) {
    assert.equal(exampleFence(file, "example\n"), ["```" + language, "example", "```"].join("\n"));
  }
});

test("a custom runner runs once in the website directory without invoking Node on the browser file", async () => {
  const calls = [];
  await runExampleTests({ sandbox: tmpdir(), testFile: "browser-only.tsx", testExamples: directory => calls.push(directory) });
  assert.deepEqual(calls, [path.resolve(import.meta.dirname, "../..")]);
});

for (const testFile of [undefined, "chosen.test.mjs"]) {
  test(`Node executes ${testFile ?? "examples.test.mjs by default"} in the example sandbox`, async context => {
    const sandbox = await mkdtemp(path.join(tmpdir(), "sdk-runner-"));
    context.after(() => rm(sandbox, { recursive: true, force: true }));
    const filename = testFile ?? "examples.test.mjs";
    await writeFile(path.join(sandbox, filename), 'import { writeFileSync } from "node:fs"; writeFileSync("ran", import.meta.filename);');
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // The fixture runs in its own Node test process.
    context.mock.property(process, "env", env);
    await runExampleTests({ sandbox, testFile });
    assert.equal(await readFile(path.join(sandbox, "ran"), "utf8"), path.join(sandbox, filename));
  });
}
