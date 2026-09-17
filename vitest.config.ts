import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * The same version define vite.config.ts applies.
 *
 * It has to be repeated here because the test run does not go through the Vite
 * config, and any component reading __APP_VERSION__ would otherwise throw a
 * ReferenceError under vitest. Kept identical in both places on purpose: a test
 * that renders the About dialog should see the version the build would show.
 */
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
    pool: "forks",
    forks: {
      singleFork: true,
    },
  },
});
