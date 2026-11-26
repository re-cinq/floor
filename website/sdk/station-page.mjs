import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { installRelease, pageTokens } from "./release.mjs";

const website = path.resolve(import.meta.dirname, "..");
const repository = path.dirname(website);
const sandbox = path.join(website, ".generated/released-station");
const sdk = "@re-cinq/floor-station";
const version = await installRelease(sdk, sandbox);
const examples = ["worker.mts", "file-worker.mts", "poll.mts"];
for (const name of examples) {
  await copyFile(path.join(repository, "examples/code/hello", name), path.join(sandbox, name));
}
await copyFile(path.join(import.meta.dirname, "examples.test.mjs"), path.join(sandbox, "examples.test.mjs"));
execFileSync(path.join(website, "node_modules/.bin/tsc"), ["--project", "sdk/tsconfig.json", "--noEmit"], { cwd: website, stdio: "inherit" });
execFileSync(process.execPath, ["--test", "--test-timeout=10000", "examples.test.mjs"], { cwd: sandbox, stdio: "inherit" });

execFileSync(path.join(website, "node_modules/.bin/typedoc"), [], { cwd: website, stdio: "inherit" });

const tokens = await pageTokens("station", sdk, version, "website/sdk/examples.test.mjs");
for (const name of examples) {
  const contents = await readFile(path.join(sandbox, name), "utf8");
  tokens[name] = `\`\`\`ts\n${contents.trimEnd()}\n\`\`\``;
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
