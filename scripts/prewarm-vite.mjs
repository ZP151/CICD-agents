#!/usr/bin/env node
/**
 * Pre-warms the Vite dev server used by the live-app e2e suite before the
 * real Playwright run starts.
 *
 * Why: Vite compiles route chunk graphs on demand (dynamic imports;
 * server.warmup in vite.config.ts covers only static graphs). On this machine
 * a cold compile is probabilistic — observed 24-88s for the document, 15-98s
 * per module group, and one run (2026-08-08 F4) where the final chat-runtime
 * wave of 44 modules stalled server-side for 86+s until teardown. Warming the
 * full graph once here — with reload retries so a one-time dep-optimizer
 * re-run settles before the run — makes the suite's beforeAll warmup fast and
 * deterministic (it then hits the warm transform cache, ~1s per navigation).
 *
 * Exit 0 = chat composer and the Pipelines workspace are interactive; the app
 * module graph is compiled. Non-zero = the warm budget was exhausted; the run
 * should not start against a cold server.
 *
 * Env overrides (budgets, default values were calibrated against observed cold
 * compiles):
 *   MERGEPILOT_E2E_APP_URL        (default http://127.0.0.1:1420)
 *   MERGEPILOT_E2E_PORT_WAIT_MS   (default 120000)
 *   MERGEPILOT_E2E_READY_MS       per-attempt readiness window (default 120000)
 *   MERGEPILOT_E2E_CHAT_ATTEMPTS  reload retries for the chat route (default 8)
 */
import { chromium } from "@playwright/test";

const APP_URL = process.env.MERGEPILOT_E2E_APP_URL ?? "http://127.0.0.1:1420";
const PORT_WAIT_MS = Number(process.env.MERGEPILOT_E2E_PORT_WAIT_MS ?? 120_000);
const READY_MS = Number(process.env.MERGEPILOT_E2E_READY_MS ?? 120_000);
const CHAT_ATTEMPTS = Number(process.env.MERGEPILOT_E2E_CHAT_ATTEMPTS ?? 8);
const PIPELINES_ATTEMPTS = 3;

const log = (...a) => console.log(`[prewarm] ${new Date().toISOString()}`, ...a);

async function waitForPort(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(APP_URL, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Vite did not respond on ${APP_URL} within ${timeoutMs}ms`);
}

async function waitVisible(page, locator, timeoutMs) {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function warmChat(page) {
  for (let attempt = 1; attempt <= CHAT_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      log(`chat not ready in attempt ${attempt - 1}; reloading (attempt ${attempt}/${CHAT_ATTEMPTS})`);
    }
    try {
      await page.goto(`${APP_URL}/chat?new=1`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    } catch (err) {
      log(`goto attempt ${attempt} failed: ${String(err).split("\n")[0]}`);
      continue;
    }
    const ok = await waitVisible(page, page.getByPlaceholder(/Ask MergePilot/), READY_MS);
    if (ok) {
      log(`chat composer interactive after ${attempt} attempt(s)`);
      return true;
    }
  }
  return false;
}

async function warmPipelines(page) {
  for (let attempt = 1; attempt <= PIPELINES_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      log(`pipelines not ready in attempt ${attempt - 1}; reloading (attempt ${attempt}/${PIPELINES_ATTEMPTS})`);
    }
    try {
      await page.goto(`${APP_URL}/#/pipelines`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    } catch (err) {
      log(`pipelines goto attempt ${attempt} failed: ${String(err).split("\n")[0]}`);
      continue;
    }
    const ok = await waitVisible(page, page.getByRole("heading", { name: "Pipelines" }), READY_MS);
    if (ok) {
      log("pipelines workspace interactive");
      return true;
    }
  }
  return false;
}

async function main() {
  const started = Date.now();
  await waitForPort(PORT_WAIT_MS);
  log(`Vite is up on ${APP_URL}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  try {
    const chatOk = await warmChat(page);
    if (!chatOk) {
      throw new Error(`chat route did not become interactive within ${CHAT_ATTEMPTS} attempts of ${READY_MS}ms`);
    }
    const pipelinesOk = await warmPipelines(page);
    if (!pipelinesOk) {
      throw new Error("pipelines route did not become interactive during prewarm");
    }
    log(`prewarm complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    process.exitCode = 0;
  } catch (err) {
    log(`PREWARM FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main();
