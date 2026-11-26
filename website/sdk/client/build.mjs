import { execFileSync } from "node:child_process";
import { buildSdk } from "../build.mjs";

execFileSync(process.execPath, ["--test", "sdk/client/build.test.mjs"], { stdio: "inherit" });
await buildSdk({
  name: "client",
  tutorial: "hello-world-client",
  examples: ["start.mts", "watch-run.mts", "watch-floor.mts", "visit.mts", "hello.mts"],
});
