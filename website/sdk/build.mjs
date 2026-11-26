import { fillTemplate } from "./template.mjs";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { installRelease, pageTokens } from "./release.mjs";

const website = path.resolve(import.meta.dirname, "..");
export async function buildSdk({ name, tutorial, examples, fixtures = [] }) {
  const templates = path.join(import.meta.dirname, name);
  const sandbox = path.join(website, ".generated", "released-" + name);
  const sdk = "@re-cinq/floor-" + name;
  const version = await installRelease(sdk, sandbox);
  const tokens = await pageTokens(name, sdk, version, `website/sdk/${name}/examples.test.mjs`);
  for (const fixture of fixtures) {
    await copyFile(path.resolve(website, "../examples/code", fixture), path.join(sandbox, path.basename(fixture)));
  }
  for (const example of examples) {
    const file = path.join(sandbox, example);
    await copyFile(path.resolve(website, "../examples/code", name, example), file);
    const source = await readFile(file, "utf8");
    tokens[example] = `\`\`\`ts\n${source.trimEnd()}\n\`\`\``;
  }
  await copyFile(path.join(templates, "examples.test.mjs"), path.join(sandbox, "examples.test.mjs"));
  const execute = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
  execute(path.join(website, "node_modules/.bin/tsc"), ["--project", `sdk/${name}/tsconfig.json`, "--noEmit"], website);
  execute(process.execPath, ["--test", "--test-timeout=10000", "examples.test.mjs"], sandbox);
  execute(path.join(website, "node_modules/.bin/typedoc"), ["--options", `sdk/${name}/typedoc.json`], website);

  async function render(templateName, destination, appendix = "") {
    const template = await readFile(path.join(templates, templateName), "utf8");
    const page = fillTemplate(template, tokens);
    const file = path.join(website, "src/content/docs", destination);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, page.trimEnd() + "\n" + appendix);
  }

  const reference = await readFile(path.join(website, ".generated", name, "api.md"), "utf8");
  await renderSdkPages({ name, tutorial, reference }, render);
}

export async function renderSdkPages({ name, tutorial, reference }, render) {
  await render("page.md", `sdk/${name}.md`, "\n" + reference);
  if (tutorial) await render("tutorial.md", `tutorials/${tutorial}.md`);
}
