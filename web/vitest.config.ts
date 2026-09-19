import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Transform .tsx files for import analysis only (no JSX runtime needed for .ts tests)
    jsx: "automatic",
  },
});
