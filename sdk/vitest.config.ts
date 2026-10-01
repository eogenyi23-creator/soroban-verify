import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The sdk has no unit tests — it is exercised through the CLI integration
    // tests (cli/src/commands/__tests__/commands.test.ts). Allow vitest to exit
    // cleanly when no test files are found.
    passWithNoTests: true,
  },
});
