import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest covers unit tests under src/. The Playwright E2E specs live in
    // app/tests/ and are run by Playwright once that tooling is wired in.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
