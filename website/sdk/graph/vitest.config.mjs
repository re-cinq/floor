import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  root: new URL("../../.generated/released-graph/", import.meta.url).pathname,
  esbuild: { jsx: "automatic" },
  optimizeDeps: { include: ["react/jsx-dev-runtime"] },
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    include: ["examples.test.tsx"],
    browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] },
  },
});
