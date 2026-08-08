import { expect, type Page, test } from "@playwright/test";

/**
 * Repro: a second turn.approval.requested in the same turn (arriving on the
 * confirm-action stream) must render a second pending-action card.
 */
const projectLink = {
  id: "pl-1",
  name: "CICD-agents link",
  repoPath: "C:\\repo",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://dev.azure.com/demo",
  adoProject: "Demo",
  adoRepoName: "repo",
  adoPat: "",
  createdAt: 1,
  updatedAt: 1,
};

async function mockRuntime(page: Page): Promise<void> {
  await page.addInitScript((pl) => {
    localStorage.setItem("mergepilot_active_project_link_id", pl.id);
    localStorage.setItem(
      "mergepilot_project_links",
      JSON.stringify([{ ...pl, adoMcpEnabled: false, adoMcpDomains: "repositories,pipelines,work-items" }]),
    );
  }, projectLink);
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
  await page.route("http://127.0.0.1:8787/auth/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, name: "Zhou Ping" }) });
  });
  await page.route("http://127.0.0.1:8787/project-links", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([projectLink]) });
  });

  const approvalA = {
    id: "approval-a",
    riskLevel: "medium",
    explanation: "Stage the fixture file",
    action: { tool: "git_add", args: { paths: ["fixture.txt"] }, description: "Stage fixture.txt" },
  };
  const approvalB = {
    id: "approval-b",
    riskLevel: "high",
    explanation: "Commit the staged change",
    action: { tool: "git_commit", args: { message: "fixture commit" }, description: "Commit staged change" },
  };

  let started = false;
  await page.route("http://127.0.0.1:8787/chat", async (route) => {
    if (route.request().method() === "POST" && !started) {
      started = true;
      const body = [
        { event: "session", data: JSON.stringify({ sessionId: "sess-1" }) },
        { event: "turn.started", data: JSON.stringify({ type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: Date.now(), clientTurnId: "local-1" }) },
        { event: "turn.approval.requested", data: JSON.stringify({ type: "turn.approval.requested", turnId: "turn-1", sequence: 1, emittedAt: Date.now(), approval: approvalA }) },
      ].map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join("");
      await route.fulfill({ status: 200, contentType: "text/event-stream", body, headers: { "x-chat-session-id": "sess-1" } });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  let confirmCount = 0;
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/chat\/.+\/confirm-action/, async (route) => {
    confirmCount += 1;
    await page.evaluate((n) => { (window as unknown as Record<string, number>).__confirmCount = n; }, confirmCount);
    const body = [
      { event: "turn.approval.resolved", data: JSON.stringify({ type: "turn.approval.resolved", turnId: "turn-1", sequence: 10, approvalId: "approval-a", approved: true }) },
      { event: "turn.approval.requested", data: JSON.stringify({ type: "turn.approval.requested", turnId: "turn-1", sequence: 11, emittedAt: Date.now(), approval: approvalB }) },
    ].map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join("");
    await route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });
}

test("renders a second approval card in the same turn", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`PAGEERROR: ${String(err).slice(0, 500)}`));
  page.on("console", (msg) => { if (msg.text().includes("DBG")) errors.push(`DBG: ${msg.text()}`); else if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text().slice(0, 500)}`); });
  await mockRuntime(page);
  await page.goto("/#/chat?new=1");

  await page.getByPlaceholder(/Ask MergePilot/).fill("Stage the fixture file and commit it");
  await page.getByRole("button", { name: /Send message/ }).click();

  const firstCard = page.getByTestId("pending-action-card").first();
  await expect(firstCard).toBeVisible({ timeout: 20_000 });
  await expect(firstCard.getByText("Stage fixture.txt")).toBeVisible();

  await firstCard.getByRole("button", { name: "Approve and run" }).click();
  // The approved card transitions to an "Executing approved action" state card
  // (no pending-action-card testid); the follow-up approval must still reach
  // the render list as a new pending-action card.
  const secondCard = page.getByTestId("pending-action-card").filter({ hasText: "Commit staged change" });
  await expect(secondCard).toBeVisible({ timeout: 20_000 });
  await expect(secondCard.getByRole("button", { name: "Approve and run" })).toBeVisible();
});
