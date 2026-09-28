import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    // Every suite here shares one real Postgres instance and truncates overlapping tables in beforeEach; running test files in parallel races those truncates against each other.
    fileParallelism: false,
  },
});
