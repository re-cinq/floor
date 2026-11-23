import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: webRoot,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@protocol": fileURLToPath(new URL("../src/protocol.ts", import.meta.url)),
    },
  },
  build: { outDir: fileURLToPath(new URL("../dist/web", import.meta.url)), emptyOutDir: true },
});
