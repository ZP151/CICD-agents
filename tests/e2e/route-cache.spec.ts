import { expect, type Page, test } from "@playwright/test";

const projectLink = {
  id: "cache-project-link",
  name: "ClaimBot_API link",
  repoPath: "C:\\Users\\15492\\Develop\\ClaimBot_API",
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

const secondaryProjectLink = {
  ...projectLink,
  id: "secondary-cache-project-link",
  name: "Secondary link",
  repoPath: "C:\\Users\\15492\\Develop\\OtherRepo",
  adoRepoName: "OtherRepo",
  adoPipelineId: "118",
  adoPipelineName: "OtherRepo",
};

const pullRequest = {
  id: 2670,
  title: "Update CommonFunctions.cs and ClaimController.cs",
  repository: "ClaimBot_API",
  sourceBranch: "feature/cache-test",
  targetBranch: "main",
  status: "active",
  createdBy: "Zhou Ping",
  creationDate: "2026-07-07T02:16:32.000Z",
  url: "https://tebssg.visualstudio.com/project/_git/repo/pullrequest/2670",
  reviewerCount: 1,
  voteSummary: { approved: 1, rejected: 0, waiting: 0, noVote: 0 },
  isDraft: false,
  labels: [],
  workItems: [],
  threads: [],
  pipelineRun: {
    id: 4680,
    name: "20260706.1",
    state: "completed",
    result: "succeeded",
    createdDate: "2026-07-06T10:00:00.000Z",
    finishedDate: "2026-07-06T10:05:00.000Z",
    url: "https://tebssg.visualstudio.com/_build/results?buildId=4680&definitionId=117",
  },
};

const reviewQueueItem = {
  repository: "ClaimBot_API",
  pullRequestId: 2670,
  lastIterationId: 4,
  findingCount: 3,
  lastRunAt: "2026-07-07T02:16:32.000Z",
  sourceCommit: "0649066f311f",
  decisionQueue: "needs_human_review",
  decisionRiskLevel: "medium",
  decisionReason: "Warnings need human review.",
  decisionReasonCodes: ["risk.medium"],
  contextConfidence: "high",
  autoApprovedAt: "",
  autoApprovalActor: "",
  discardedFindingCount: 0,
  hunkCoverageFiles: 0,
  wholeFileFallbackFiles: 2,
  changedHunkLines: 0,
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

const secondaryReviewQueueItem = {
  ...reviewQueueItem,
  repository: "OtherRepo",
  pullRequestId: 3001,
  decisionReason: "Second project requires review.",
};

const activityTask = {
  id: "task-cache-1",
  kind: "submit-pipeline",
  status: "succeeded",
  payload: { repoPath: projectLink.repoPath },
  steps: [
    {
      seq: 1,
      name: "Collect pipeline evidence",
      detail: "Pipeline #117 inspected",
      status: "succeeded",
      createdAt: 1783330000,
    },
  ],
  result: {},
  error: "",
  createdAt: 1783330000,
  startedAt: 1783330001,
  finishedAt: 1783330003,
};

const checkpointActivity = {
  id: "checkpoint-cache-1",
  sessionId: "chat_cache_activity",
  repoPath: projectLink.repoPath,
  projectLinkId: projectLink.id,
  at: 1783330100,
  toolName: "git_add",
  toolSummary: '{"returncode":0,"stdout":"M README.md"}',
  toolOk: true,
  checkpointId: "git-2026-07-07T02-00-00Z",
  checkpointPath: "C:\\Users\\15492\\.mergepilot\\checkpoints\\git-cache.json",
};

async function mockBaseRuntime(
  page: Page,
  options: { projectLinks?: Array<typeof projectLink> } = {},
): Promise<void> {
  await page.route("http://127.0.0.1:8787/healthz", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, llmConfigured: true }),
    });
  });
  await page.route("http://127.0.0.1:8787/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        displayName: "Zhou Ping",
        email: "Zhou.Ping@example.test",
      }),
    });
  });
  await page.route("http://127.0.0.1:8787/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        displayName: "Zhou Ping",
        email: "Zhou.Ping@example.test",
      }),
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
        reviewAutoApproveEnabled: true,
        reviewStaleAgeHours: 24,
      }),
    });
  });
  await page.route("http://127.0.0.1:8787/project-links", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.projectLinks ?? [projectLink]),
    });
  });
  await page.route("http://127.0.0.1:8787/chat/history", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.route("http://127.0.0.1:8787/tasks", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.route(/http:\/\/127\.0\.0\.1:8787\/tasks\/[^/]+$/, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "not found" }),
    });
  });
  await page.route("http://127.0.0.1:8787/chat/checkpoints", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await page.route(
    /http:\/\/127\.0\.0\.1:8787\/chat\/checkpoints\/[^/]+\/preview.*/,
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "not found" }),
      });
    },
  );
  await page.route(
    /http:\/\/127\.0\.0\.1:8787\/chat\/checkpoints\/[^/]+\/rollback-plan.*/,
    async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "not found" }),
      });
    },
  );
  await page.route(
    `http://127.0.0.1:8787/project-links/${projectLink.id}/review-operations`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    },
  );
  await page.route(
    /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/pr-insights.*/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], history: [] }),
      });
    },
  );
}

test.describe("workspace route caching", () => {
  test("@smoke @mocked keeps New Chat welcome suggestions stable until index status resolves", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let resolveIndexStatus: (() => void) | undefined;
    await page.route("http://127.0.0.1:8787/chat/index-status", async (route) => {
      await new Promise<void>((resolve) => {
        resolveIndexStatus = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          repoPath: projectLink.repoPath,
          indexed: true,
          semanticReady: true,
          retrievalMode: "semantic-index",
          stats: {
            filesIndexed: 10,
            chunksIndexed: 30,
            chunksEmbedded: 30,
            chunksPendingEmbedding: 0,
          },
          summary: "Ready",
        }),
      });
    });

    await page.goto("/#/chat", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Ask MergePilot anything")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review my changes" })).toBeHidden();
    resolveIndexStatus?.();
    await expect(page.getByRole("button", { name: "Review my changes" })).toBeVisible();
  });

  test("@smoke @mocked does not reuse New Chat index prompts after Project Link switch", async ({
    page,
  }) => {
    await mockBaseRuntime(page, { projectLinks: [projectLink, secondaryProjectLink] });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_active_project_link_id", "cache-project-link");
    });
    let releaseSecondaryIndex: (() => void) | undefined;
    await page.route("http://127.0.0.1:8787/chat/index-status", async (route) => {
      const body = route.request().postDataJSON() as {
        projectLink?: { id?: string };
        repoPath?: string;
      };
      if (body.projectLink?.id === secondaryProjectLink.id) {
        await new Promise<void>((resolve) => {
          releaseSecondaryIndex = resolve;
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            repoPath: secondaryProjectLink.repoPath,
            indexed: false,
            semanticReady: false,
            retrievalMode: "grep",
            stats: {
              filesIndexed: 0,
              chunksIndexed: 0,
              chunksEmbedded: 0,
              chunksPendingEmbedding: 0,
            },
            summary: "Not indexed",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          repoPath: body.repoPath ?? projectLink.repoPath,
          indexed: true,
          semanticReady: true,
          retrievalMode: "semantic-index",
          stats: {
            filesIndexed: 10,
            chunksIndexed: 30,
            chunksEmbedded: 30,
            chunksPendingEmbedding: 0,
          },
          summary: "Ready",
        }),
      });
    });

    await page.goto("/#/chat");
    await expect(
      page.getByRole("button", { name: "Explain this project architecture" }),
    ).toBeVisible();
    await page.getByLabel("Composer Project Link").selectOption(secondaryProjectLink.id);
    await expect(page.getByLabel("Composer Project Link")).toHaveValue(secondaryProjectLink.id);
    await expect(
      page.getByRole("button", { name: "Explain this project architecture" }),
    ).toBeHidden();
    await expect(page.locator(".animate-pulse")).toHaveCount(5);
    releaseSecondaryIndex?.();
    await expect(page.getByRole("button", { name: "Understand this project" })).toBeVisible();
  });

  test("@smoke @mocked keeps cached Pull Requests visible while refresh is pending", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let delayRefresh = false;
    let releaseRefresh: (() => void) | undefined;
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests.*/,
      async (route) => {
        if (delayRefresh) {
          await new Promise<void>((resolve) => {
            releaseRefresh = resolve;
          });
          delayRefresh = false;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pr-insights.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], history: [] }),
        });
      },
    );

    await page.goto("/#/pulls");
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    delayRefresh = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("Refreshing pull requests...")).toBeVisible();
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    releaseRefresh?.();
    await expect(page.getByText("Refreshing pull requests...")).toBeHidden();
  });

  test("@smoke @mocked does not show empty Pull Requests before Project Links resolve", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let releaseProjectLinks: (() => void) | undefined;
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await new Promise<void>((resolve) => {
        releaseProjectLinks = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([projectLink]),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/pull-requests?status=active`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );

    await page.goto("/#/pulls");
    await expect(page.getByText("Loading pull requests...")).toBeVisible();
    await expect(page.getByText("No pull requests found")).toBeHidden();
    releaseProjectLinks?.();
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
  });

  test("@smoke @mocked does not show stale Pull Requests after Project Link switch", async ({
    page,
  }) => {
    await mockBaseRuntime(page, { projectLinks: [projectLink, secondaryProjectLink] });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_active_project_link_id", "cache-project-link");
    });
    let releaseSecondaryPulls: (() => void) | undefined;
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests.*/,
      async (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.includes(secondaryProjectLink.id)) {
          await new Promise<void>((resolve) => {
            releaseSecondaryPulls = resolve;
          });
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              pullRequests: [
                {
                  ...pullRequest,
                  id: 3001,
                  title: "Secondary project pull request",
                  repository: "OtherRepo",
                },
              ],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pr-insights.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], history: [] }),
        });
      },
    );

    await page.goto("/#/pulls");
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    await page.locator("select").first().selectOption(secondaryProjectLink.id);
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeHidden();
    await expect(page.getByText("Loading pull requests...")).toBeVisible();
    releaseSecondaryPulls?.();
    await expect(page.getByText("Secondary project pull request")).toBeVisible();
  });

  test("@smoke @mocked keeps Pull Requests failure visible on warm route return", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_active_project_link_id", "cache-project-link");
    });
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests.*/,
      async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "azure_auth_required",
            message: "Azure credential expired or missing. Please sign in again.",
          }),
        });
      },
    );
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pr-insights.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], history: [] }),
        });
      },
    );

    await page.goto("/#/pulls");
    await expect(page.getByText("Azure credential expired or missing")).toBeVisible();
    await page.getByRole("link", { name: "New chat" }).click();
    await page.getByRole("link", { name: "Pull Requests" }).click();
    await expect(page.getByText("Loading pull requests...")).toBeHidden();
    await expect(page.getByText("Azure credential expired or missing")).toBeVisible();
  });

  test("@smoke @mocked shows readable PR insight scope instead of internal Project Link id", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pr-insights.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "artifact-readable-scope",
                projectLinkId: projectLink.id,
                repository: pullRequest.repository,
                pullRequestId: pullRequest.id,
                title: pullRequest.title,
                kind: "insight_preview",
                at: "2026-07-07T02:20:00.000Z",
                summary: "Existing insight summary.",
                readiness: "needs_attention",
                risks: ["policy"],
                categories: { blocking: [], warnings: ["policy"], info: [] },
                signals: { fileCount: 2, threadCount: 0, failedBuildCount: 0, workItemCount: 0 },
                tokensIn: 120,
                tokensOut: 80,
              },
            ],
            history: [],
          }),
        });
      },
    );

    await page.goto("/#/pulls");
    await page.getByRole("button", { name: "Open insight" }).click();
    const sidePanel = page.locator("aside").filter({ hasText: "PR insight" });
    await expect(sidePanel).toBeVisible();
    await expect(sidePanel.getByText("Scope: ClaimBot_API link")).toBeVisible();
    await expect(sidePanel.getByText(`Project Link: ${projectLink.id}`)).toBeHidden();
  });

  test("@smoke @mocked keeps duplicate PR ids distinct across Project Links", async ({ page }) => {
    await mockBaseRuntime(page, { projectLinks: [projectLink, secondaryProjectLink] });
    await page.addInitScript(() => {
      localStorage.setItem(
        "mergepilot_pr_insight_artifacts_v1",
        JSON.stringify([
          {
            id: "cache-project-link/ClaimBot_API/2670/insight_preview/2026-07-07T02%3A20%3A00.000Z",
            projectLinkId: "cache-project-link",
            repository: "ClaimBot_API",
            pullRequestId: 2670,
            title: "Primary duplicate PR",
            kind: "insight_preview",
            at: "2026-07-07T02:20:00.000Z",
            summary: "Primary insight.",
            readiness: "ready",
            risks: [],
            tokensIn: 80,
            tokensOut: 40,
          },
          {
            id: "secondary-cache-project-link/ClaimBot_API/2670/insight_preview/2026-07-07T02%3A21%3A00.000Z",
            projectLinkId: "secondary-cache-project-link",
            repository: "ClaimBot_API",
            pullRequestId: 2670,
            title: "Secondary duplicate PR",
            kind: "insight_preview",
            at: "2026-07-07T02:21:00.000Z",
            summary: "Secondary insight.",
            readiness: "needs_attention",
            risks: ["policy"],
            tokensIn: 90,
            tokensOut: 50,
          },
        ]),
      );
    });
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests.*/,
      async (route) => {
        const requestUrl = route.request().url();
        const body = requestUrl.includes(secondaryProjectLink.id)
          ? {
              pullRequests: [
                {
                  ...pullRequest,
                  title: "Secondary duplicate PR",
                  repository: "ClaimBot_API",
                  sourceBranch: "feature/secondary-duplicate",
                },
              ],
            }
          : {
              pullRequests: [
                {
                  ...pullRequest,
                  title: "Primary duplicate PR",
                  repository: "ClaimBot_API",
                  sourceBranch: "feature/primary-duplicate",
                },
              ],
            };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      },
    );
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pr-insights.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], history: [] }),
        });
      },
    );

    await page.goto("/#/pulls");
    await page.locator("select").first().selectOption("");
    await expect(page.getByText("Primary duplicate PR")).toBeVisible();
    await expect(page.getByText("Secondary duplicate PR")).toBeVisible();
    const secondaryCard = page.locator("article").filter({ hasText: "Secondary duplicate PR" });
    await secondaryCard.getByRole("button", { name: "Open insight" }).click();
    const sidePanel = page.locator("aside").filter({ hasText: "PR insight" });
    await expect(sidePanel.getByText("#2670 Secondary duplicate PR")).toBeVisible();
    await expect(sidePanel.getByText("Scope: Secondary link")).toBeVisible();
    await expect(sidePanel.getByText("Secondary insight.")).toBeVisible();
    await expect(sidePanel.getByText("Primary insight.")).toBeHidden();
  });

  test("@smoke @mocked keeps cached Review Queue decisions visible while refresh is pending", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let delayRefresh = false;
    let releaseRefresh: (() => void) | undefined;
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/review-queue`,
      async (route) => {
        if (delayRefresh) {
          await new Promise<void>((resolve) => {
            releaseRefresh = resolve;
          });
          delayRefresh = false;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ configured: false, storage: "local", items: [reviewQueueItem] }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page.getByText("Warnings need human review.")).toBeVisible();
    delayRefresh = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("Refreshing review decisions...")).toBeVisible();
    await expect(page.getByText("Warnings need human review.")).toBeVisible();
    releaseRefresh?.();
    await expect(page.getByText("Refreshing review decisions...")).toBeHidden();
  });

  test("@smoke @mocked does not show empty Review Queue before Project Links resolve", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let releaseProjectLinks: (() => void) | undefined;
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await new Promise<void>((resolve) => {
        releaseProjectLinks = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([projectLink]),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/review-queue`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ configured: false, storage: "local", items: [reviewQueueItem] }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page.getByText("Loading review decisions...")).toBeVisible();
    await expect(page.getByText("No review decisions found")).toBeHidden();
    releaseProjectLinks?.();
    await expect(page.getByText("Warnings need human review.")).toBeVisible();
  });

  test("@smoke @mocked keeps Review Queue failure visible on warm route return", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_active_project_link_id", "cache-project-link");
    });
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/review-queue/,
      async (route) => {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "storage_forbidden",
            message: "Azure Table Storage access is not available for this user.",
          }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page.getByText("Azure Table Storage access is not available")).toBeVisible();
    await page.getByRole("link", { name: "New chat" }).click();
    await page.getByRole("link", { name: "Review Queue" }).click();
    await expect(page.getByText("Loading review decisions...")).toBeHidden();
    await expect(page.getByText("Azure Table Storage access is not available")).toBeVisible();
  });

  test("@smoke @mocked clears Review Queue storage warning immediately after Project Link switch", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([projectLink, secondaryProjectLink]),
      });
    });
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/review-operations/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      },
    );
    let releaseSecondaryQueue: (() => void) | undefined;
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/review-queue/,
      async (route) => {
        if (route.request().url().includes(secondaryProjectLink.id)) {
          await new Promise<void>((resolve) => {
            releaseSecondaryQueue = resolve;
          });
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              configured: false,
              storage: "local",
              items: [secondaryReviewQueueItem],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "storage_forbidden",
            message: "Azure Table Storage access is not available for this user.",
          }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page.getByText("Azure Table Storage access is not available")).toBeVisible();
    await page.locator("select").first().selectOption(secondaryProjectLink.id);
    await expect(page.getByText("Azure Table Storage access is not available")).toBeHidden();
    releaseSecondaryQueue?.();
    await expect(page.getByText("Second project requires review.")).toBeVisible();
  });

  test("@smoke @mocked does not show stale Review Queue decisions after Project Link switch", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([projectLink, secondaryProjectLink]),
      });
    });
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/review-operations/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      },
    );
    let releaseSecondaryQueue: (() => void) | undefined;
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/review-queue/,
      async (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.includes(secondaryProjectLink.id)) {
          await new Promise<void>((resolve) => {
            releaseSecondaryQueue = resolve;
          });
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              configured: false,
              storage: "local",
              items: [secondaryReviewQueueItem],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ configured: false, storage: "local", items: [reviewQueueItem] }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page.getByText("Warnings need human review.")).toBeVisible();
    await page.locator("select").first().selectOption(secondaryProjectLink.id);
    await expect(page.getByText("Warnings need human review.")).toBeHidden();
    await expect(page.getByText("Loading review decisions...")).toBeVisible();
    releaseSecondaryQueue?.();
    await expect(page.getByText("Second project requires review.")).toBeVisible();
  });

  test("@smoke @mocked closes Review Queue findings panel after Project Link switch", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        "mergepilot_pr_findings_v1",
        JSON.stringify({
          ClaimBot_API: {
            "2670": [
              {
                severity: "medium",
                category: "design",
                file: "BotToSharePoint/Common/CommonFunctions.cs",
                line: 12,
                message: "Review cached finding",
              },
            ],
          },
        }),
      );
    });
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([projectLink, secondaryProjectLink]),
      });
    });
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/review-operations/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      },
    );
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/review-queue/,
      async (route) => {
        const requestUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: requestUrl.includes(secondaryProjectLink.id)
            ? JSON.stringify({
                configured: false,
                storage: "local",
                items: [secondaryReviewQueueItem],
              })
            : JSON.stringify({ configured: false, storage: "local", items: [reviewQueueItem] }),
        });
      },
    );

    await page.goto("/#/findings");
    await page.getByRole("button", { name: /View findings/ }).click();
    await expect(page.getByRole("heading", { name: /Review Findings/ })).toBeVisible();
    await page.locator("select").first().selectOption(secondaryProjectLink.id);
    await expect(page.getByRole("heading", { name: /Review Findings/ })).toBeHidden();
    await expect(page.getByText("Second project requires review.")).toBeVisible();
  });

  test("@smoke @mocked keeps cached pipeline rows visible while discovery refreshes", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let delayDiscovery = false;
    let releaseDiscovery: (() => void) | undefined;
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/pull-requests?status=active`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      if (delayDiscovery) {
        await new Promise<void>((resolve) => {
          releaseDiscovery = resolve;
        });
        delayDiscovery = false;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: "117", name: "ClaimBot_API" }] }),
      });
    });

    await page.goto("/#/pipelines");
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    delayDiscovery = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("Refreshing pipeline discovery...")).toBeVisible();
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    releaseDiscovery?.();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  });

  test("@smoke @mocked does not show empty Pipelines before Project Links resolve", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let releaseProjectLinks: (() => void) | undefined;
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await new Promise<void>((resolve) => {
        releaseProjectLinks = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([projectLink]),
      });
    });
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/pull-requests?status=active`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: "117", name: "ClaimBot_API" }] }),
      });
    });

    await page.goto("/#/pipelines");
    await expect(page.getByLabel("Checking pipelines")).toBeVisible();
    await expect(page.getByText("No Project Links available")).toBeHidden();
    await expect(page.getByText("No pipelines discovered yet")).toBeHidden();
    releaseProjectLinks?.();
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
  });

  test("@smoke @mocked shows pipeline action errors in the detail panel", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/pull-requests?status=active`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: "117", name: "ClaimBot_API" }] }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Pipeline inspection failed: ADO permission denied" }),
      });
    });

    await page.goto("/#/pipelines");
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    await page.getByRole("button", { name: "Inspect runs" }).click();
    await expect(page.getByText("Pipeline inspection failed: ADO permission denied")).toBeVisible();
    await page.getByRole("button", { name: "Details" }).click();
    const detailPanel = page.locator("aside").filter({ hasText: "Pipeline action failed" });
    await expect(detailPanel).toBeVisible();
    await expect(detailPanel.getByText(/\/chat\/workflow-action HTTP 500/)).toBeVisible();
  });

  test("@smoke @mocked closes pipeline detail panel when the selected row is filtered out", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/pull-requests?status=active`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: "117", name: "ClaimBot_API" }] }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Pipeline inspection failed: ADO permission denied" }),
      });
    });

    await page.goto("/#/pipelines");
    await page.getByRole("button", { name: "Inspect runs" }).click();
    await page.getByRole("button", { name: "Details" }).click();
    await expect(page.locator("aside").filter({ hasText: "Pipeline action failed" })).toBeVisible();
    await page.getByRole("button", { name: /Failed\s+0/ }).click();
    await expect(page.locator("aside").filter({ hasText: "Pipeline action failed" })).toBeHidden();
    await expect(page.getByText("No pipelines match this filter.")).toBeVisible();
  });

  test("@smoke @mocked keeps cached Activity runs visible while refresh is pending", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let delayRefresh = false;
    let releaseRefresh: (() => void) | undefined;
    await page.route("http://127.0.0.1:8787/tasks", async (route) => {
      if (delayRefresh) {
        await new Promise<void>((resolve) => {
          releaseRefresh = resolve;
        });
        delayRefresh = false;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([activityTask]),
      });
    });
    await page.route(`http://127.0.0.1:8787/tasks/${activityTask.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(activityTask),
      });
    });

    await page.goto("/#/activity");
    const taskButton = page.locator("button").filter({ hasText: "Pipeline submission:" });
    await expect(taskButton).toBeVisible();
    delayRefresh = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(taskButton).toBeVisible();
    await expect(page.getByText("Loading activity...")).toBeHidden();
    releaseRefresh?.();
  });

  test("@smoke @mocked keeps checkpoint raw output collapsed by default", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/chat/checkpoints", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([checkpointActivity]),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/chat/checkpoints/${checkpointActivity.id}/preview?maxDiffChars=12000`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            checkpointId: checkpointActivity.checkpointId,
            path: checkpointActivity.checkpointPath,
            createdAt: "2026-07-07T02:00:00Z",
            repoPath: projectLink.repoPath,
            reason: "test",
            branch: "main",
            head: "abc123",
            statusLines: ["M README.md"],
            files: ["README.md"],
            diffPreview: "diff --git a/README.md b/README.md",
            diffChars: 42,
            diffTruncated: false,
          }),
        });
      },
    );
    await page.route(
      `http://127.0.0.1:8787/chat/checkpoints/${checkpointActivity.id}/rollback-plan`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            checkpointId: checkpointActivity.checkpointId,
            repoPath: projectLink.repoPath,
            branch: "main",
            head: "abc123",
            supported: true,
            mode: "already_at_checkpoint",
            reason: "Already at checkpoint.",
            checkpointFiles: [],
            currentStatusLines: [],
            currentTrackedPaths: [],
            currentUntrackedPaths: [],
            proposal: null,
            warnings: [],
          }),
        });
      },
    );

    await page.goto("/#/activity");
    await page.getByRole("button", { name: /git_add/ }).click();
    await expect(page.getByText("Git checkpoint before confirmed action")).toBeVisible();
    await expect(page.getByText('{"returncode":0')).toBeHidden();
    await page.getByText("Raw output").click();
    await expect(page.getByText('{"returncode":0')).toBeVisible();
  });
});
