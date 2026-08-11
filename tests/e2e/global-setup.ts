import { chromium, type FullConfig } from "@playwright/test";

const MOCKED_ROUTE_WARMUP_TIMEOUT_MS = 120_000;

/**
 * Keep mocked browser acceptance on the same Vite process that compiled its
 * lazy route chunks. Vite's server.warmup is intentionally asynchronous, so
 * Playwright can otherwise observe the HTTP server before a route module is
 * ready and leave the page in the Suspense fallback on a cold machine.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env["MERGEPILOT_E2E_LIVE_APP"] === "1") return;

  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string" || !baseURL.trim()) {
    throw new Error("Mocked Playwright warmup requires a configured baseURL.");
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  try {
    for (const route of [
      "/#/chat?new=1",
      "/#/activity",
      "/#/settings",
      "/#/pulls",
      "/#/pipelines",
      "/#/work",
      "/#/project-links",
    ]) {
      await page.goto(new URL(route, baseURL).toString(), {
        waitUntil: "domcontentloaded",
        timeout: MOCKED_ROUTE_WARMUP_TIMEOUT_MS,
      });
      await page
        .getByRole("region", { name: "Preparing workspace page" })
        .waitFor({ state: "hidden", timeout: MOCKED_ROUTE_WARMUP_TIMEOUT_MS });
    }
  } finally {
    await browser.close();
  }
}
