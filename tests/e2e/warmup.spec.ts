import { test } from "@playwright/test";

/**
 * Vite on-demand compilation warmup.
 *
 * After a large source change set, the first browser hit on each route pays
 * an on-demand Vite compile of the chunk graph (plus its lazy imports).
 * Running this spec first forces those compiles so the real specs measure
 * the app, not the compiler. The warmup asserts nothing about behavior.
 */
test("warmup compiles route chunks", async ({ page }) => {
  const routes = [
    "/#/chat?new=1",
    "/#/activity",
    "/#/settings",
    "/#/pulls",
    "/#/pipelines",
    "/#/work",
  ];
  for (const route of routes) {
    await page.goto(route);
    // Wait for the lazy Suspense fallback to resolve: the shell renders the
    // navigation rail once the app chunk graph has loaded.
    await page.getByRole("navigation").first().waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(500);
  }
});
