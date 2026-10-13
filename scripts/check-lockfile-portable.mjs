// The Dockerfile builds node_modules on the builder's platform and ships it to every target.
import { readFileSync } from "node:fs";

const lockfile = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

const platformBound = Object.entries(lockfile.packages)
  .filter(
    ([path, entry]) =>
      path !== "" &&
      !entry.dev &&
      (entry.cpu || entry.os || entry.hasInstallScript),
  )
  .map(([path]) => path);

if (platformBound.length > 0) {
  console.error(
    "runtime dependencies bound to a platform, which the cross-built image cannot carry:",
  );
  for (const path of platformBound) console.error(`  ${path}`);
  process.exit(1);
}

console.log("every runtime dependency is portable");
