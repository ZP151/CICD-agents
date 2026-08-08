import { defaultExclude, defineConfig } from "vitest/config";

// Live-gated suites (MERGEPILOT_E2E_LIVE_ADO / _AZURE) belong to the live
// tier. In credential-free unit runs they would register as skips, which the
// Verification Run Module's requireNoSkips correctly flags as a hidden-skip
// risk; exclude them instead so the unit tier stays skip-free and any new
// skip fails the gate.
const liveTier = process.env.MERGEPILOT_E2E_LIVE_ADO === "1" || process.env.MERGEPILOT_E2E_LIVE_AZURE === "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: liveTier ? defaultExclude : [...defaultExclude, "test/live*.test.ts"],
    testTimeout: 30000,
  },
});
