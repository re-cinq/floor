// What a package would ship, checked before it ships: `node scripts/check-pack-list.mjs packages/station packages/pipeline`. A published version cannot be taken back, and the pack list is the only place where what ships is a fact.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ALWAYS = ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts"];
const SHIPPED_BESIDE_DIST = ["package.json", "README.md", "LICENSE"];
const USAGE_ERROR = 2;
const directories = process.argv.slice(USAGE_ERROR);

function problemsOf(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  const packed = packListOf(directory);
  const required = [...ALWAYS, ...Object.values(manifest.bin ?? {})];

  return [
    ...required.filter((path) => !packed.includes(path)).map((path) => `${manifest.name}: ${path} is missing`),
    ...packed.filter(isUnwanted).map((path) => `${manifest.name}: ${path} must not ship`),
  ];
}

// `--ignore-scripts`: what is listed is what was built, and no second build of it.
function packListOf(directory) {
  const listed = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: directory, encoding: "utf8" });
  const [pack] = JSON.parse(listed);

  return pack.files.map((file) => file.path);
}

// A test tests what nobody receives, and a map names a source nobody receives.
function isUnwanted(path) {
  if (SHIPPED_BESIDE_DIST.includes(path)) return false;

  return !path.startsWith("dist/") || path.includes(".test.") || path.endsWith(".map");
}

const problems = directories.flatMap(problemsOf);

problems.forEach((problem) => console.error(problem));
if (problems.length > 0 || directories.length === 0) process.exitCode = 1;
if (problems.length === 0) console.log(`pack lists clean: ${directories.join(", ")}`);
