import { expect, type Page, test } from "@playwright/test";

const profile = {
  id: "pw-profile",
  name: "CICD-agents link",
  repoPath: "C:\\Users\\15492\\Develop\\Agents\\CICD-agents",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://dev.azure.com/demo-org",
  adoProject: "Agents",
  adoRepoName: "CICD-agents",
  adoPat: "",
  adoPipelineId: "12",
  adoPipelineName: "CI",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
  createdAt: 1,
  updatedAt: 1,
};

const feedItem = {
  id: 123,
  type: "Task",
  title: "Inspector fixture",
  state: "New",
  revision: 3,
  iterationPath: "Agents\\Sprint 1",
  description: "Do the thing",
  acceptanceCriteria: "It works",
  comments: ["feed comment one", "feed comment two", "feed comment three"],
  drift: [
    { kind: "active_without_evidence", evidence: [], followUp: "Add a verified update.", question: false },
  ],
};

const longComment = `c${"x".repeat(10_000)}`;

const detail = {
  workItem: {
    id: 123,
    revision: 3,
    type: "Task",
    title: "Inspector fixture",
    state: "New",
    description: "<p>Do the thing</p>",
    acceptanceCriteria: "It works",
    iterationPath: "Agents\\Sprint 1",
    tags: ["alpha", "beta"],
    assignedTo: "Ada Lovelace",
    createdDate: "2026-08-01T00:00:00Z",
    changedDate: "2026-08-07T00:00:00Z",
    relations: [
      { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/demo-org/Agents/_apis/wit/workItems/1", kind: "parent", id: 1 },
      { rel: "ArtifactLink", url: "vstfs:///Git/Ref/pid/rid/refs%2Fheads%2Ffeature%2Finspector", kind: "branch", label: "feature/inspector" },
    ],
    linkedPullRequests: [
      { id: 321, title: "Inspector PR", status: "active", sourceBranch: "feature/inspector", targetBranch: "main", url: "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/r/pullrequests/321" },
    ],
    linkedBuilds: [
      { id: 5001, buildNumber: "20260807.3", status: "completed", result: "succeeded", definitionName: "CI", url: "https://dev.azure.com/demo-org/Agents/_apis/build/Builds/5001" },
    ],
    testEvidence: [
      { buildId: 5001, runCount: 1, totalTests: 40, passedTests: 38, failedTests: 2 },
    ],
    comments: ["feed comment one", "feed comment two", "feed comment three", longComment],
  },
};

async function mockRuntime(page: Page): Promise<void> {
  await page.route("http://127.0.0.1:8787/healthz", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        llmConfigured: true,
        cloudProjectLinkStore: false,
        cloudSecrets: false,
        cloudSessions: false,
      }),
    });
  });

  await page.route("http://127.0.0.1:8787/project-links", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([profile]),
    });
  });

  await page.route("http://127.0.0.1:8787/chat/history", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route("http://127.0.0.1:8787/chat/index-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repoPath: profile.repoPath,
        indexed: true,
        semanticReady: true,
        retrievalMode: "semantic-index",
        stats: { filesIndexed: 12, chunksIndexed: 32, chunksEmbedded: 32, chunksPendingEmbedding: 0 },
        summary: "Ready",
      }),
    });
  });

  // Feed (list) and detail are distinct shapes; register the exact feed URL
  // first and the detail glob second so the glob takes precedence.
  await page.route("http://127.0.0.1:8787/delivery/work-items?projectLinkId=pw-profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ workItems: [feedItem] }),
    });
  });

  await page.route(/http:\/\/127\.0\.0\.1:8787\/delivery\/work-items\/\d+.*/, async (route) => {
    const id = route.request().url().match(/\/delivery\/work-items\/(\d+)/)?.[1] ?? "";
    if (id === "999") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated detail failure" }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) });
  });
}

function mockActionEndpoints(page: Page): void {
  // Approve carries no body, so the verified record must echo the kind that
  // was proposed on this page.
  let lastKind = "work_item.update";
  void page.route("http://127.0.0.1:8787/delivery/actions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    lastKind = String(body.kind ?? "work_item.comment");
    const target = body.target as { id?: number } | undefined;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "act-1",
        status: "pending",
        kind: lastKind,
        target: target ?? {},
        payload: body.payload ?? {},
      }),
    });
  });

  void page.route(/http:\/\/127\.0\.0\.1:8787\/delivery\/actions\/[^/]+\/(approve|reject)/, async (route) => {
    const verb = route.request().url().endsWith("/approve") ? "approve" : "reject";
    // The daemon returns the stored record, whose target retains the proposal's
    // projectLinkId — the desktop surfaces the verified notice only for records
    // that belong to the active Project Link.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "act-1",
        status: verb === "approve" ? "verified" : "rejected",
        kind: lastKind,
        target: { kind: "work_item", projectLinkId: "pw-profile", id: 123, revision: verb === "approve" ? 4 : 3 },
        payload: verb === "approve" ? { fields: { "System.State": "In Progress" } } : {},
      }),
    });
  });
}

test.describe("Work inspector", () => {
  test.beforeEach(async ({ page }) => {
    await mockRuntime(page);
    mockActionEndpoints(page);
  });

  test("@smoke @mocked inspects a work item end to end with keyboard access", async ({ page }) => {
    // First hit compiles the lazy work chunk graph on demand in this
    // Playwright process; budget the Vite compilation, not the assertions.
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/#/work");

    await expect(page.getByText("Review Azure Boards tasks, their delivery signals, and recent updates")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Inspector fixture")).toBeVisible();

    // Expand the item: the authoritative detail read loads all sections.
    await page.getByRole("button", { name: /Open work item #123/ }).click();
    await expect(page.getByText("All comments")).toBeVisible();
    await expect(page.getByText("Task detail")).toBeVisible();
    await expect(page.getByText("Details")).toBeVisible();
    await expect(page.getByText("Ada Lovelace")).toBeVisible();
    await expect(page.getByText("alpha, beta")).toBeVisible();
    await expect(page.getByText("Dependencies & links")).toBeVisible();
    await expect(page.getByText("Parent")).toBeVisible();
    await expect(page.getByText("feature/inspector", { exact: true })).toBeVisible();
    await expect(page.getByText("Linked pull requests")).toBeVisible();
    await expect(page.getByText(/Inspector PR \(#321 · active · feature\/inspector → main\)/)).toBeVisible();
    await expect(page.getByText("Builds")).toBeVisible();
    await expect(page.getByText(/20260807\.3 · completed \/ succeeded · CI/)).toBeVisible();
    await expect(page.getByText("Test evidence")).toBeVisible();
    await expect(page.getByText("Build 5001: 1 run, 38/40 passed, 2 failed")).toBeVisible();
    // The full comment thread, not the feed's three-up slice.
    await expect(page.getByText("feed comment one")).toBeVisible();
    await expect(page.getByText(/cxxx/)).toBeVisible();

    // Keyboard access: Escape closes the inspector without running anything.
    await page.keyboard.press("Escape");
    await expect(page.getByText("All comments")).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Open work item #123/ })).toHaveAttribute("aria-expanded", "false");
  });

  test("@mocked shows the load-failure state with a recoverable retry", async ({ page }) => {
    test.setTimeout(240_000);
    await page.route("http://127.0.0.1:8787/delivery/work-items?projectLinkId=pw-profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workItems: [{ ...feedItem, id: 999 }] }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/#/work");

    await expect(page.getByText("Inspector fixture")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: /Open work item #999/ }).click();
    await expect(page.getByText("Work item detail failed")).toBeVisible();
    // The daemon answers 5xx with { error }, which the client surfaces as the
    // status fallback — the 500 itself is the marker that the mock was hit.
    await expect(page.getByText("Work item detail HTTP 500")).toBeVisible();

    // The feed still stands: proposals remain available from the viewed item.
    await page.getByRole("button", { name: "Move to In Progress" }).click();
    await expect(page.getByText("This will propose changing the state to In Progress. Nothing changes until approval.")).toBeVisible();
    await page.getByRole("button", { name: "Request approval" }).click();
    await expect(page.getByText("Review before running")).toBeVisible();
    await expect(page.getByText(/Set the work item state to In Progress/)).toBeVisible();
  });

  test("@mocked runs a governed write-back only after explicit approval", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/#/work");

    await expect(page.getByText("Inspector fixture")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: /Open work item #123/ }).click();
    await expect(page.getByText("All comments")).toBeVisible();

    // Propose the state change; nothing writes until approval.
    await page.getByRole("button", { name: "Move to In Progress" }).click();
    await expect(page.getByText("This will propose changing the state to In Progress. Nothing changes until approval.")).toBeVisible();
    await page.getByRole("button", { name: "Request approval" }).click();
    await expect(page.getByText("Review before running")).toBeVisible();
    await expect(page.getByText(/Set the work item state to In Progress/)).toBeVisible();

    // Reject leaves the item untouched and clears the pending proposal.
    await page.getByRole("button", { name: "Skip action" }).click();
    await expect(page.getByText("Review before running")).not.toBeVisible();

    // Propose again and approve: the verified record updates the item row.
    await page.getByRole("button", { name: "Move to In Progress" }).click();
    await page.getByRole("button", { name: "Request approval" }).click();
    await expect(page.getByText("Review before running")).toBeVisible();
    await page.getByRole("button", { name: "Approve and run" }).click();
    await expect(page.getByText("work_item.update verified against Azure DevOps.")).toBeVisible();
    await expect(page.getByText("#123 Inspector fixture — Set the work item state to In Progress")).not.toBeVisible();
    await expect(page.getByText(/· In Progress · rev 4/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Move to In Progress" })).toBeDisabled();
  });

  test("@mocked shows the no-data state for an empty work list", async ({ page }) => {
    test.setTimeout(240_000);
    await page.route("http://127.0.0.1:8787/delivery/work-items?projectLinkId=pw-profile", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workItems: [] }) });
    });
    await page.goto("/#/work");

    await expect(page.getByText("No work items in this view.")).toBeVisible({ timeout: 120_000 });
  });
});
