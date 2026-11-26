import { buildSdk } from "../build.mjs";

await buildSdk({
  name: "pipeline",
  tutorial: "pipeline-round-trip",
  examples: ["read.mts", "import.mts"],
  fixtures: ["hello/hello.yaml"],
});
