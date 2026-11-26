import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const website = path.resolve(import.meta.dirname, "..");
const repository = path.dirname(website);
const run = (command, args, cwd = website) => execFileSync(command, args, { cwd, encoding: "utf8" }).trim();

export function stableVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Unexpected npm release: ${version}`);
  return version;
}

export async function installRelease(sdk, sandbox) {
  const version = stableVersion(JSON.parse(run("npm", ["view", sdk, "dist-tags.latest", "--json"])));


  await mkdir(sandbox, { recursive: true });
  await writeFile(path.join(sandbox, "package.json"), '{"private":true,"type":"module"}\n');
  run("npm", ["install", "--prefix", sandbox, "--no-save", "--no-package-lock", "--ignore-scripts", "--no-audit", "--no-fund", `${sdk}@${version}`]);
  return version;
}

export async function pageTokens(name, sdk, version, testPath) {
  const source = await readFile(path.join(repository, `packages/${name}/src/index.ts`), "utf8");
  const intro = packageIntro(source);
  const revision = run("git", ["rev-parse", "HEAD"]);
  return {
    intro,
    package: `[\`${sdk}@${version}\`](https://www.npmjs.com/package/${sdk}/v/${version})`,
    test: `https://github.com/re-cinq/floor/blob/${revision}/${testPath}`,
  };
}

export function packageIntro(source) {
  const entry = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const intro = ts.getJSDocCommentsAndTags(entry.statements[0]).find(doc =>
    ts.isJSDoc(doc) && doc.tags?.some(tag => tag.tagName.text === "packageDocumentation"))?.comment;
  if (typeof intro !== "string" || !intro.trim()) throw new Error("SDK needs a package introduction");
  return intro;
}
