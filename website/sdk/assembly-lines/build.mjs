import { buildSdk } from "../build.mjs";

await buildSdk({
  name: "assembly-lines",
  tutorial: "replay-hello-world",
  examples: ["hello.mts", "replay.mts"],
});
