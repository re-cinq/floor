import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { installRelease, pageTokens } from "../release.mjs";

const website = path.resolve(import.meta.dirname, "../..");
const sandbox = path.join(website, ".generated/released-client");
const sdk = "@re-cinq/floor-client";
const version = await installRelease(sdk, sandbox);
const tokens = await pageTokens("client", sdk, version, "website/sdk/client/examples.test.mjs");
const examples = ["start.mts", "watch-run.mts", "watch-floor.mts", "visit.mts", "hello.mts"];
for (const name of examples) {
  const file = path.join(sandbox, name);
  await copyFile(path.resolve(website, "../examples/code/client", name), file);
  const source = await readFile(file, "utf8");
  tokens[name] = `\`\`\`ts\n${source.trimEnd()}\n\`\`\``;
}
await copyFile(path.join(import.meta.dirname, "examples.test.mjs"), path.join(sandbox, "examples.test.mjs"));
const execute = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
execute(path.join(website, "node_modules/.bin/tsc"), ["--project", "sdk/client/tsconfig.json", "--noEmit"], website);
execute(process.execPath, ["--test", "--test-timeout=10000", "examples.test.mjs"], sandbox);
execute(path.join(website, "node_modules/.bin/typedoc"), ["--options", "sdk/client/typedoc.json"], website);

async function render(templateName, destination, appendix = "") {
  const template = await readFile(path.join(import.meta.dirname, templateName), "utf8");
  const page = template.replace(/{{([^}]+)}}/g, (_, key) => {
    if (!Object.hasOwn(tokens, key)) throw new Error(`Unknown client page token: ${key}`);
    return tokens[key];
  });
  const file = path.join(website, "src/content/docs", destination);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, page.trimEnd() + "\n" + appendix);
}

const reference = await readFile(path.join(website, ".generated/client/api.md"), "utf8");
await render("page.md", "sdk/client.md", "\n" + reference);
await render("tutorial.md", "tutorials/hello-world-client.md");
