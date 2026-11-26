import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const website = path.resolve(import.meta.dirname, "..");
const repository = path.dirname(website);
const sandbox = path.join(website, ".generated/released-station");
const sdk = "@re-cinq/floor-station";
const run = (command, args, cwd = website) => execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
const version = JSON.parse(run("npm", ["view", sdk, "dist-tags.latest", "--json"]));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Unexpected npm release: ${version}`);

await mkdir(sandbox, { recursive: true });
await writeFile(path.join(sandbox, "package.json"), '{"private":true,"type":"module"}\n');
run("npm", ["install", "--prefix", sandbox, "--no-save", "--no-package-lock", "--ignore-scripts", "--no-audit", "--no-fund", `${sdk}@${version}`]);
const examples = ["worker.mjs", "file-worker.mjs", "poll.mjs"];
for (const name of examples) {
  await copyFile(path.join(repository, "examples/code/hello", name), path.join(sandbox, name));
}
await copyFile(path.join(import.meta.dirname, "examples.test.mjs"), path.join(sandbox, "examples.test.mjs"));
execFileSync(process.execPath, ["--test", "--test-timeout=10000", "examples.test.mjs"], { cwd: sandbox, stdio: "inherit" });

execFileSync(path.join(website, "node_modules/.bin/typedoc"), [], { cwd: website, stdio: "inherit" });

const source = await readFile(path.join(repository, "packages/station/src/index.ts"), "utf8");
const entry = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
const intro = ts.getJSDocCommentsAndTags(entry.statements[0]).find(doc =>
  ts.isJSDoc(doc) && doc.tags?.some(tag => tag.tagName.text === "packageDocumentation"))?.comment;
if (typeof intro !== "string" || !intro.trim()) throw new Error("Station SDK needs a package introduction");

const revision = run("git", ["rev-parse", "HEAD"]);
const tokens = {
  intro,
  package: `[\`${sdk}@${version}\`](https://www.npmjs.com/package/${sdk}/v/${version})`,
  test: `https://github.com/re-cinq/floor/blob/${revision}/website/sdk/examples.test.mjs`,
};
for (const name of examples) {
  const contents = await readFile(path.join(sandbox, name), "utf8");
  tokens[name] = `\`\`\`js\n${contents.trimEnd()}\n\`\`\``;
}
const template = await readFile(path.join(import.meta.dirname, "station.md"), "utf8");
const page = template.replace(/{{([^}]+)}}/g, (_, key) => {
  if (!Object.hasOwn(tokens, key)) throw new Error(`Unknown station page token: ${key}`);
  return tokens[key];
});
const reference = await readFile(path.join(website, ".generated/station/api.md"), "utf8");
const directory = path.join(website, "src/content/docs/sdk");
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "station.md"), page.trimEnd() + "\n\n" + reference);
