import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // The daemon smoke needs a live source daemon + real ADO; run it
    // explicitly with `vitest run ... adoDaemon.smoke`.
    exclude: ["**/node_modules/**", "**/dist/**", "lib/adoDaemon.smoke.test.ts"],
    testTimeout: 30000,
  },
});
