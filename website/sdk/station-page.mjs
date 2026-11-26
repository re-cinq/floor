import { mkdir, readFile, writeFile } from "node:fs/promises";
import station from "../../packages/station/package.json" with { type: "json" };

const introduction = await readFile(new URL("./station.md", import.meta.url), "utf8");
const reference = await readFile(new URL("../.generated/station/api.md", import.meta.url), "utf8");
const directory = new URL("../src/content/docs/sdk/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("station.md", directory), [
  introduction.trimEnd(),
  `Package version: \`${station.version}\`.`,
  reference,
].join("\n\n"));
