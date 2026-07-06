import { expect, type Page, test } from "@playwright/test";

const projectLink = {
  id: "review-queue-project-link",
  name: "ClaimBot_API link",
  repoPath: "C:\\Users\\15492\\Develop\\ClaimBot_API Nov 2025\\ClaimBot_API",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://tebssg.visualstudio.com/",
  adoProject: "TeBS-ClaimBot",
  adoRepoName: "ClaimBot_API",
  adoPat: "",
  adoPipelineId: "117",
  adoPipelineName: "ClaimBot_API",
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

const reviewQueueItem = {
  repository: "ClaimBot_API",
  pullRequestId: 84,
  lastIterationId: 5,
  findingCount: 0,
  lastRunAt: "2099-01-01T00:00:00.000Z",
  sourceCommit: "feature-commit-84",
  decisionQueue: "needs_human_review",
  decisionRiskLevel: "low",
  decisionReason: "The review model did not run, so approval needs a human.",
  decisionReasonCodes: ["review.no_llm"],
  contextConfidence: "low",
  autoApprovedAt: "",
  autoApprovalActor: "",
  discardedFindingCount: 0,
  hunkCoverageFiles: 2,
  wholeFileFallbackFiles: 0,
  changedHunkLines: 4,
  manualDisposition: "",
  manualDispositionAt: "",
  manualDispositionActor: "",
  manualDispositionNote: "",
  manualDispositionEvents: [],
  manualDispositionWriteBackAttempted: false,
  manualDispositionWriteBackOk: false,
  manualDispositionWriteBackError: "",
  manualDispositionWriteBackAt: "",
  manualDispositionWriteBackThreadId: "",
  manualDispositionWriteBackUrl: "",
  manualDispositionWriteBackEvents: [],
};

async function mockReviewQueueRuntime(
  page: Page,
  dispositionPayloads: unknown[],
  options: {
    queueItems?: Array<typeof reviewQueueItem>;
    reviewRunPayloads?: unknown[];
    reviewHistoryPayloads?: unknown[];
  } = {},
): Promise<void> {
  let changesRequestedWriteBackAttempts = 0;
  const queueItems = options.queueItems ?? [reviewQueueItem];
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

  await page.route("http://127.0.0.1:8787/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, displayName: "Zhou Ping", email: "Zhou.Ping@example.test" }),
    });
  });
  await page.route("http://127.0.0.1:8787/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, displayName: "Zhou Ping", email: "Zhou.Ping@example.test" }),
    });
  });

  await page.route("http://127.0.0.1:8787/project-links", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([projectLink]),
    });
  });

  await page.route("http://127.0.0.1:8787/daemon/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llmProvider: "azure",
        secretSource: "local_env",
        azureDeployment: "gpt-4o",
        azureEmbeddingDeployment: "text-embedding-3-small",
        azureApiVersion: "2024-08-01-preview",
        azureEndpoint: "https://devagentproj-resource.openai.azure.com",
        openaiModel: "",
        aoaiKeyInVault: false,
        azureStorageAccount: "",
        azureKeyVaultUrl: "",
        azureCosmosEndpoint: "",
        azureTenantId: "",
        azureClientId: "",
        azureAuthUsesDefaultTenant: true,
        azureAuthUsesDefaultClient: true,
        reviewAutoApproveEnabled: true,
        reviewStaleAgeHours: 24,
      }),
    });
  });

  await page.route(
    `http://127.0.0.1:8787/project-links/${projectLink.id}/review-queue`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: false,
          storage: "local",
          items: queueItems,
        }),
      });
    },
  );

  await page.route(
    `http://127.0.0.1:8787/project-links/${projectLink.id}/review-run`,
    async (route) => {
      const payload = await route.request().postDataJSON();
      options.reviewRunPayloads?.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          pullRequestId: 84,
          repository: "ClaimBot_API",
          iterationId: 6,
          sourceCommit: "fresh-commit-84",
          findingCount: 1,
          decisionQueue: "needs_human_review",
          decisionRiskLevel: "medium",
          decisionReason: "Rerun review found one warning.",
          decisionReasonCodes: ["risk.medium"],
          contextConfidence: "high",
          readiness: "needs_attention",
          categories: {
            blocking: [],
            warnings: ["missing-test: BotToSharePoint/Controllers/ClaimController.cs:12"],
            info: [],
          },
          lastRunAt: "2099-01-01T00:04:00.000Z",
          autoApprovalActor: "",
          tokensIn: 1200,
          tokensOut: 220,
          summary: "One warning remains after rerun.",
          findings: [
            {
              file: "BotToSharePoint/Controllers/ClaimController.cs",
              line: 12,
              severity: "warning",
              category: "missing-test",
              message: "Add regression coverage for the changed error-handling path.",
            },
          ],
          discardedFindings: [],
          coverage: {
            totalFiles: 2,
            filesWithHunks: 2,
            wholeFileOnlyFiles: 0,
            hunkCount: 2,
            changedHunkLines: 4,
          },
        }),
      });
    },
  );

  await page.route(
    `http://127.0.0.1:8787/project-links/${projectLink.id}/review-history`,
    async (route) => {
      const payload = await route.request().postDataJSON();
      options.reviewHistoryPayloads?.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, storage: "local", record: payload }),
      });
    },
  );

  await page.route(
    `http://127.0.0.1:8787/project-links/${projectLink.id}/review-operations`,
    async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            storage: "local",
            record: {
              id: "operation-1",
              kind: "disposition",
              repository: "ClaimBot_API",
              pullRequestId: 84,
              actor: "desktop-user",
              label: "Acknowledged",
              ok: true,
              details: "Acknowledged",
              at: "2099-01-01T00:01:00.000Z",
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ storage: "local", items: [] }),
      });
    },
  );

  await page.route(
    `http://127.0.0.1:8787/project-links/${projectLink.id}/review-disposition`,
    async (route) => {
      const payload = await route.request().postDataJSON();
      dispositionPayloads.push(payload);
      const manualDisposition =
        payload && typeof payload === "object" && "manualDisposition" in payload
          ? String((payload as { manualDisposition?: unknown }).manualDisposition ?? "")
          : "";
      if (manualDisposition === "changes_requested") {
        changesRequestedWriteBackAttempts += 1;
        const posted = changesRequestedWriteBackAttempts > 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            storage: "local",
            adoWriteBack: posted
              ? {
                  attempted: true,
                  ok: true,
                  at: "2099-01-01T00:03:00.000Z",
                  threadId: "123",
                  url: "https://dev.azure.com/demo-org/Agents/_git/ClaimBot_API/pullrequest/84?_a=files&discussionId=123",
                }
              : {
                  attempted: true,
                  ok: false,
                  error: "ADO write-back still pending.",
                },
            record: {
              ...reviewQueueItem,
              decisionQueue: "blocked",
              decisionRiskLevel: "high",
              decisionReason: "Changes requested from Review Queue.",
              manualDisposition: "changes_requested",
              manualDispositionAt: "2099-01-01T00:02:00.000Z",
              manualDispositionActor: "desktop-user",
              manualDispositionNote: "Changes requested",
              manualDispositionEvents: [
                {
                  disposition: "changes_requested",
                  at: "2099-01-01T00:02:00.000Z",
                  actor: "desktop-user",
                  note: "Changes requested",
                },
              ],
              manualDispositionWriteBackAttempted: true,
              manualDispositionWriteBackOk: posted,
              manualDispositionWriteBackError: posted ? "" : "ADO write-back still pending.",
              manualDispositionWriteBackAt: posted ? "2099-01-01T00:03:00.000Z" : "",
              manualDispositionWriteBackThreadId: posted ? "123" : "",
              manualDispositionWriteBackUrl: posted
                ? "https://dev.azure.com/demo-org/Agents/_git/ClaimBot_API/pullrequest/84?_a=files&discussionId=123"
                : "",
              manualDispositionWriteBackEvents: [
                {
                  disposition: "changes_requested",
                  at: posted ? "2099-01-01T00:03:00.000Z" : "2099-01-01T00:02:00.000Z",
                  ok: posted,
                  actor: "desktop-user",
                  note: "Changes requested",
                  error: posted ? "" : "ADO write-back still pending.",
                  threadId: posted ? "123" : "",
                  url: posted
                    ? "https://dev.azure.com/demo-org/Agents/_git/ClaimBot_API/pullrequest/84?_a=files&discussionId=123"
                    : "",
                },
              ],
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          storage: "local",
          adoWriteBack: { attempted: false, ok: false },
          record: {
            ...reviewQueueItem,
            manualDisposition: "acknowledged",
            manualDispositionAt: "2099-01-01T00:01:00.000Z",
            manualDispositionActor: "desktop-user",
            manualDispositionNote: "Acknowledged",
            manualDispositionEvents: [
              {
                disposition: "acknowledged",
                at: "2099-01-01T00:01:00.000Z",
                actor: "desktop-user",
                note: "Acknowledged",
              },
            ],
          },
        }),
      });
    },
  );

  await page.addInitScript((seedProjectLink) => {
    localStorage.clear();
    localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([seedProjectLink]));
    localStorage.setItem("mergepilot_active_project_link_id", seedProjectLink.id);
  }, projectLink);
}

test.describe("Review Queue", () => {
  test("@smoke @mocked renders review-run queue evidence and records an acknowledged disposition", async ({ page }) => {
    const dispositionPayloads: unknown[] = [];
    await mockReviewQueueRuntime(page, dispositionPayloads);

    await page.goto("/#/findings");

    await expect(page.getByRole("heading", { name: "Review Queue" })).toBeVisible();
    await expect(page.getByText("Azure Table Storage is not configured")).toBeVisible();
    await expect(page.getByText("#84")).toBeVisible();
    await expect(page.getByText("The review model did not run, so approval needs a human.")).toBeVisible();
    await expect(page.getByText("iteration 5")).toBeVisible();
    await expect(page.getByText("feature-comm")).toBeVisible();
    await expect(page.getByText("2 files · 4 lines")).toBeVisible();
    await expect(page.getByText("review no llm")).toBeVisible();

    await page.getByRole("button", { name: "Acknowledge" }).click();

    await expect(page.getByText("Audit: Acknowledged")).toBeVisible();
    expect(dispositionPayloads).toHaveLength(1);
    expect(dispositionPayloads[0]).toMatchObject({
      pullRequestId: 84,
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "low",
      manualDisposition: "acknowledged",
      manualDispositionActor: "desktop-user",
      manualDispositionNote: "Acknowledged",
      writeBackToAdo: false,
    });
  });

  test("requests changes with ADO write-back and retries a pending write-back", async ({ page }) => {
    const dispositionPayloads: unknown[] = [];
    await mockReviewQueueRuntime(page, dispositionPayloads);

    await page.goto("/#/findings");

    await expect(page.getByRole("heading", { name: "Review Queue" })).toBeVisible();
    await expect(page.getByText("#84")).toBeVisible();

    await page.getByRole("button", { name: "Request changes" }).click();

    await expect(page.getByText("Audit: Changes requested · ADO pending")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry ADO" })).toBeVisible();
    expect(dispositionPayloads).toHaveLength(1);
    expect(dispositionPayloads[0]).toMatchObject({
      pullRequestId: 84,
      decisionQueue: "blocked",
      decisionRiskLevel: "high",
      manualDisposition: "changes_requested",
      manualDispositionActor: "desktop-user",
      manualDispositionNote: "Changes requested",
      manualDispositionWriteBackAttempted: true,
      writeBackToAdo: true,
    });

    await page.getByRole("button", { name: "Retry ADO" }).click();

    await expect(page.getByText("Audit: Changes requested · ADO posted")).toBeVisible();
    await expect(page.getByRole("link", { name: "open thread" })).toBeVisible();
    expect(dispositionPayloads).toHaveLength(2);
    expect(dispositionPayloads[1]).toMatchObject({
      pullRequestId: 84,
      manualDisposition: "changes_requested",
      manualDispositionWriteBackAttempted: true,
      writeBackToAdo: true,
    });
  });

  test("reruns stale review decisions and refreshes the queue card", async ({ page }) => {
    const reviewRunPayloads: unknown[] = [];
    const reviewHistoryPayloads: unknown[] = [];
    await mockReviewQueueRuntime(page, [], {
      queueItems: [
        {
          ...reviewQueueItem,
          lastRunAt: "2000-01-01T00:00:00.000Z",
          contextConfidence: "high",
          decisionRiskLevel: "medium",
          decisionReasonCodes: ["context.whole_file_fallback"],
          wholeFileFallbackFiles: 1,
        },
      ],
      reviewRunPayloads,
      reviewHistoryPayloads,
    });

    await page.goto("/#/findings");

    await expect(page.getByText(/stale:/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Rerun stale/ })).toBeEnabled();

    await page.getByRole("button", { name: /Rerun stale/ }).click();

    await expect(page.getByText("Rerun review found one warning.")).toBeVisible();
    await expect(page.getByText("iteration 6")).toBeVisible();
    await expect(page.getByText("fresh-commit")).toBeVisible();
    await expect(page.getByText("risk medium")).toBeVisible();
    expect(reviewRunPayloads).toHaveLength(1);
    expect(reviewRunPayloads[0]).toMatchObject({
      pullRequestId: 84,
      targetBranch: "main",
    });
    expect(reviewHistoryPayloads).toHaveLength(1);
    expect(reviewHistoryPayloads[0]).toMatchObject({
      pullRequestId: 84,
      lastIterationId: 6,
      sourceCommit: "fresh-commit-84",
      findingCount: 1,
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      decisionReason: "Rerun review found one warning.",
      hunkCoverageFiles: 2,
      changedHunkLines: 4,
    });
  });
});
