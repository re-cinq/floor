import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
      "@protocol": fileURLToPath(new URL("./src/protocol.ts", import.meta.url)),
    },
  },
  test: { setupFiles: ["./web/vitest.setup.ts"], environment: "node", testTimeout: 20000, include: ["src/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"] },
});
