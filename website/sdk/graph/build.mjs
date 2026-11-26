import { copyFile } from "node:fs/promises";
import { build } from "vite";
import { execFileSync } from "node:child_process";
import { buildSdk } from "../build.mjs";

// The first build downloads the headless browser; subsequent builds reuse Playwright's cache.
execFileSync("node_modules/.bin/playwright", ["install", "--only-shell", "chromium"], { stdio: "inherit" });
await buildSdk({
  name: "graph",
  tutorial: "hello-world-graph",
  examples: ["hello.ts", "App.tsx", "graph.css"],
  testFile: "examples.test.tsx",
  testExamples: website => execFileSync("node_modules/.bin/vitest", ["run", "--config", "sdk/graph/vitest.config.mjs"], { cwd: website, stdio: "inherit" }),
});

const sandbox = ".generated/released-graph";
for (const file of ["index.html", "main.tsx"]) {
  await copyFile(`sdk/graph/${file}`, `${sandbox}/${file}`);
}
await build({
  root: sandbox,
  base: "./",
  configFile: false,
  esbuild: { jsx: "automatic" },
  build: { outDir: "../../public/demos/hello-world-graph", emptyOutDir: true },
});
