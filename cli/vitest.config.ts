import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests are required — passWithNoTests removed so CI fails if tests are accidentally deleted
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
  },
});
