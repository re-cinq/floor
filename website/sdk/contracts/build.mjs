import { buildSdk } from "../build.mjs";

await buildSdk({ name: "contracts", examples: ["report.mts", "frame.mts"] });
