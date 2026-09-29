import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    // Route tests share one real Postgres instance and truncate overlapping tables in beforeEach; running test files in parallel races those truncates against each other.
    fileParallelism: false,
    // The wire contract is checked by the compiler, not at runtime: without this, *.test-d.ts is collected and runs nothing.
    typecheck: { enabled: true, include: ["src/**/*.test-d.ts"] },
  },
});
