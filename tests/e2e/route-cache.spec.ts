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

const prInsightActivity = {
  id: "cache-project-link/ClaimBot_API/2670/review_run/2026-07-07T02%3A18%3A00.000Z",
  projectLinkId: projectLink.id,
  repository: "ClaimBot_API",
  pullRequestId: 2670,
  title: "Review ClaimBot_API error handling",
  kind: "review_run",
  at: "2026-07-07T02:18:00.000Z",
  summary: "The saved review found medium-risk error-handling changes.",
  readiness: "needs_attention",
  decisionQueue: "needs_human_review",
  decisionRiskLevel: "medium",
  contextConfidence: "high",
  risks: ["Exception handling needs human review."],
  findingCount: 3,
  discardedFindingCount: 0,
  tokensIn: 900,
  tokensOut: 260,
};

const reviewOperation = {
  id: "review-op-cache-1",
  projectLinkId: projectLink.id,
  kind: "review_run",
  at: "2026-07-07T02:19:00.000Z",
  repository: "ClaimBot_API",
  pullRequestId: 2670,
  actor: "Zhou Ping",
  label: "Review run completed",
  ok: true,
  details: "Review operation recorded for PR #2670.",
};

const avatarDataUrl =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

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
        name: "Zhou Ping",
        upn: "Zhou.Ping@example.test",
        avatarDataUrl,
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
        name: "Zhou Ping",
        upn: "Zhou.Ping@example.test",
        avatarDataUrl,
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
  test("@smoke @mocked renders the signed-in user avatar image in the sidebar", async ({
    page,
  }) => {
    await mockBaseRuntime(page);

    await page.goto("/#/chat", { waitUntil: "domcontentloaded" });

    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Zhou Ping")).toBeVisible();
    await expect(sidebar.locator(`img[src="${avatarDataUrl}"]`)).toBeVisible();
    await expect(sidebar.getByText("ZP")).toBeHidden();
  });

  test("@smoke @mocked keeps cached Project Links from triggering route skeletons during background sync", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.addInitScript((cachedProjectLink) => {
      localStorage.setItem("mergepilot_active_project_link_id", cachedProjectLink.id);
      localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([cachedProjectLink]));
    }, projectLink);
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
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: "117", name: "ClaimBot_API" }] }),
      });
    });

    await page.goto("/#/pulls", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Preparing pull requests")).toBeHidden();
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();

    await page.getByRole("link", { name: "Pipelines" }).click();
    await expect(page.getByLabel("Pipeline loading placeholders")).toBeHidden();
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    releaseProjectLinks?.();
  });

  test("@smoke @mocked keeps New Chat empty state quiet without index-status preload", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let indexStatusRequests = 0;
    await page.route("http://127.0.0.1:8787/chat/index-status", async (route) => {
      indexStatusRequests += 1;
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
    await expect(page.getByText("Ask MergePilot anything")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review my changes" })).toBeHidden();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await page.waitForTimeout(120);
    expect(indexStatusRequests).toBe(0);
    await expect(page.getByRole("button", { name: "Review my changes" })).toHaveCount(0);
    await expect(page.getByText("Ask MergePilot anything")).toHaveCount(0);
  });

  test("@smoke @mocked does not show stale New Chat prompts after Project Link switch", async ({
    page,
  }) => {
    await mockBaseRuntime(page, { projectLinks: [projectLink, secondaryProjectLink] });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_active_project_link_id", "cache-project-link");
    });
    let secondaryIndexRequests = 0;
    await page.route("http://127.0.0.1:8787/chat/index-status", async (route) => {
      const body = route.request().postDataJSON() as {
        projectLink?: { id?: string };
        repoPath?: string;
      };
      if (body.projectLink?.id === secondaryProjectLink.id) {
        secondaryIndexRequests += 1;
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
    ).toHaveCount(0);
    await page.getByLabel("Composer Project Link").selectOption(secondaryProjectLink.id);
    await expect(page.getByLabel("Composer Project Link")).toHaveValue(secondaryProjectLink.id);
    await expect(
      page.getByRole("button", { name: "Explain this project architecture" }),
    ).toBeHidden();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await page.waitForTimeout(120);
    expect(secondaryIndexRequests).toBe(0);
    await expect(page.getByRole("button", { name: "Understand this project" })).toHaveCount(0);
  });

  test("@smoke @mocked keeps New Chat warm return free of skeleton pulses", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/chat/index-status", async (route) => {
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
    await expect(page.getByRole("button", { name: "Review my changes" })).toHaveCount(0);
    await expect(page.locator(".animate-pulse")).toHaveCount(0);

    await page.getByRole("link", { name: "Activity" }).click();
    await expect(page.getByText("Operational history")).toBeVisible();

    await page.getByRole("link", { name: "New chat" }).click();
    await page.waitForTimeout(80);
    await expect(page.getByRole("button", { name: "Review my changes" })).toHaveCount(0);
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
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

  test("@smoke @mocked keeps cached Pull Requests visible while status filter refreshes", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    let releaseCompletedPulls: (() => void) | undefined;
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests.*/,
      async (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.includes("status=completed")) {
          await new Promise<void>((resolve) => {
            releaseCompletedPulls = resolve;
          });
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              pullRequests: [
                {
                  ...pullRequest,
                  id: 2671,
                  title: "Completed cache status pull request",
                  status: "completed",
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
    await page.getByLabel("Pull Requests status").selectOption("completed");
    await expect(page.getByText("Refreshing pull requests...")).toBeVisible();
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    await expect(page.getByLabel("Preparing pull requests")).toBeHidden();
    releaseCompletedPulls?.();
    await expect(page.getByText("Completed cache status pull request")).toBeVisible();
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
    await expect(page.getByLabel("Preparing pull requests")).toBeVisible();
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
    await page.getByLabel("Pull Requests Project Link").selectOption(secondaryProjectLink.id);
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeHidden();
    await expect(page.getByLabel("Preparing pull requests")).toBeVisible();
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
    await expect(page.getByText("/project-links/")).toBeHidden();
    await expect(page.getByText("HTTP 401")).toBeHidden();
    await page.getByRole("link", { name: "New chat" }).click();
    await page.getByRole("link", { name: "Pull Requests" }).click();
    await expect(page.getByText("Loading pull requests...")).toBeHidden();
    await expect(page.getByText("Azure credential expired or missing")).toBeVisible();
    await expect(page.getByText("/project-links/")).toBeHidden();
    await expect(page.getByText("HTTP 401")).toBeHidden();
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
                summary:
                  "**Status:** Ready\n\n- **Risk:** low\n- Evidence includes `CommonFunctions.cs`.",
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
    const prCard = page.locator("article").filter({ hasText: pullRequest.title });
    const latestInsight = prCard.getByRole("button", { name: /Latest insight/ });
    await expect(latestInsight).toContainText("Status: Ready");
    await expect(latestInsight.locator("li").filter({ hasText: "Risk: low" })).toBeVisible();
    await expect(latestInsight.locator("code").filter({ hasText: "CommonFunctions.cs" })).toBeVisible();
    await expect(latestInsight).not.toContainText("**Status:**");
    await page.getByRole("button", { name: "Open insight" }).click();
    const sidePanel = page.locator("aside").filter({ hasText: "PR insight" });
    await expect(sidePanel).toBeVisible();
    await expect(sidePanel.getByText("AI insight")).toBeVisible();
    await expect(sidePanel.getByRole("button", { name: "Refresh insight" })).toBeVisible();
    await expect(sidePanel.getByRole("button", { name: "Generate insight" })).toBeHidden();
    await expect(sidePanel.getByText("Scope: ClaimBot_API link")).toBeVisible();
    await expect(sidePanel.getByText(`Project Link: ${projectLink.id}`)).toBeHidden();
    await expect(sidePanel).toContainText("Status: Ready");
    await expect(sidePanel.locator("li").filter({ hasText: "Risk: low" })).toBeVisible();
    await expect(sidePanel.locator("code").filter({ hasText: "CommonFunctions.cs" })).toBeVisible();
    await expect(sidePanel).not.toContainText("**Status:**");
  });

  test("@smoke @mocked Project Link edits update Pull Requests insight scope", async ({
    page,
  }) => {
    const editedProjectLink = {
      ...projectLink,
      repoPath: "C:\\Users\\15492\\Develop\\EditedRepo",
      adoRepoName: "EditedRepo",
      updatedAt: 2,
    };
    let projectLinksResponse: Array<typeof projectLink> = [projectLink];
    await mockBaseRuntime(page, { projectLinks: projectLinksResponse });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_active_project_link_id", "cache-project-link");
    });
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(projectLinksResponse),
      });
    });
    await page.route(`http://127.0.0.1:8787/project-links/${projectLink.id}`, async (route) => {
      if (route.request().method() !== "PUT") {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const updated = {
        ...projectLink,
        ...body,
        id: projectLink.id,
        repoPath: editedProjectLink.repoPath,
        adoRepoName: editedProjectLink.adoRepoName,
        updatedAt: editedProjectLink.updatedAt,
      };
      projectLinksResponse = [updated as typeof projectLink];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      });
    });
    await page.route(/http:\/\/127\.0\.0\.1:8787\/git\/branches.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ branches: ["main", "feature/cache-test"] }),
      });
    });
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests.*/,
      async (route) => {
        const isEdited = projectLinksResponse[0]?.adoRepoName === "EditedRepo";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pullRequests: [
              {
                ...pullRequest,
                repository: isEdited ? "EditedRepo" : "ClaimBot_API",
                title: isEdited ? "Edited repository pull request" : "Original repository pull request",
              },
            ],
          }),
        });
      },
    );
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pr-insights.*/,
      async (route) => {
        const isEdited = projectLinksResponse[0]?.adoRepoName === "EditedRepo";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: isEdited
              ? []
              : [
                  {
                    id: "artifact-original-scope",
                    projectLinkId: projectLink.id,
                    repository: "ClaimBot_API",
                    pullRequestId: pullRequest.id,
                    title: "Original repository pull request",
                    kind: "insight_preview",
                    at: "2026-07-07T02:20:00.000Z",
                    summary: "Original repository insight.",
                    readiness: "ready",
                    risks: [],
                    tokensIn: 120,
                    tokensOut: 80,
                  },
                ],
            history: [],
          }),
        });
      },
    );

    await page.goto("/#/project-links");
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit Project Link" })).toBeVisible();
    await page.getByLabel("Repo path").fill(editedProjectLink.repoPath);
    await page.getByLabel("Repository name").fill(editedProjectLink.adoRepoName);
    await page.getByRole("button", { name: "Save Project Link" }).click();
    await expect(page.getByRole("heading", { name: "Project Links" })).toBeVisible();

    await page.getByRole("link", { name: "Pull Requests" }).click();
    await expect(page.getByText("Edited repository pull request")).toBeVisible();
    await expect(page.getByText("Original repository pull request")).toBeHidden();
    await expect(page.getByText("Original repository insight.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Generate insight" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open insight" })).toBeHidden();
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
    await page.getByLabel("Pull Requests Project Link").selectOption("");
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
    await expect(page.getByLabel("Preparing review queue")).toBeVisible();
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
    await page.getByLabel("Review Queue Project Link").selectOption(secondaryProjectLink.id);
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
    await page.getByLabel("Review Queue Project Link").selectOption(secondaryProjectLink.id);
    await expect(page.getByText("Warnings need human review.")).toBeHidden();
    await expect(page.getByLabel("Preparing review queue")).toBeVisible();
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
    await page.getByLabel("Review Queue Project Link").selectOption(secondaryProjectLink.id);
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
    await expect(page.getByLabel("Pipeline loading placeholders")).toBeVisible();
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
    await expect(detailPanel.getByText("Pipeline inspection failed: ADO permission denied")).toBeVisible();
    await expect(detailPanel.getByText("/chat/workflow-action")).toBeHidden();
    await expect(detailPanel.getByText("HTTP 500")).toBeHidden();
  });

  test("@smoke @mocked shows pipeline AI analysis errors without hiding local evidence", async ({
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
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: { type: "inspect_pipeline" },
          repoPath: projectLink.repoPath,
          summary: "Pipeline #117 inspected.",
          workflowState: { status: "done" },
          tools: [
            {
              name: "ado_list_pipeline_runs",
              command: "ado list pipeline runs",
              ok: true,
              stdout: JSON.stringify({ runs: [pullRequest.pipelineRun] }),
              stderr: "",
              returncode: 0,
            },
          ],
          artifacts: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/pipelines/analyze", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Azure OpenAI analysis failed" }),
      });
    });

    await page.goto("/#/pipelines");
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    await page.getByRole("button", { name: "AI analyze" }).click();
    const card = page.locator("article").filter({ hasText: "ClaimBot_API" });
    await expect(card.getByText("AI analysis")).toBeVisible();
    await expect(card.getByText("Error")).toBeVisible();
    await expect(card.getByText("Runs inspected: 1")).toBeVisible();
    await page.getByRole("button", { name: "Open analysis" }).click();
    const detailPanel = page.locator("aside").filter({ hasText: "Pipeline detail" });
    await expect(detailPanel.getByText("AI analysis failed.")).toBeVisible();
    await expect(detailPanel.getByText("Azure OpenAI analysis failed")).toBeVisible();
    await expect(detailPanel.getByText("Runs inspected: 1")).toBeVisible();
    await expect(detailPanel.getByText("Ready")).toBeHidden();
  });

  test("@smoke @mocked renders successful pipeline AI analysis as Markdown with run evidence", async ({
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
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: { type: "inspect_pipeline" },
          repoPath: projectLink.repoPath,
          summary: "Pipeline #117 inspected.",
          workflowState: { status: "done" },
          tools: [
            {
              name: "ado_list_pipeline_runs",
              command: "ado list pipeline runs",
              ok: true,
              stdout: JSON.stringify({ runs: [pullRequest.pipelineRun] }),
              stderr: "",
              returncode: 0,
            },
          ],
          artifacts: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/pipelines/analyze", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "llm",
          analysis: [
            "**Status:** Pipeline #117 latest run succeeded.",
            "",
            "- **Risk:** low",
            "- Evidence preserved from Azure run `20260706.1`.",
            "- Next action: keep this as the CI connection.",
          ].join("\n"),
        }),
      });
    });

    await page.goto("/#/pipelines");
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    await page.getByRole("button", { name: "AI analyze" }).click();
    const card = page.locator("article").filter({ hasText: "ClaimBot_API" });
    await expect(card.getByText("AI analysis")).toBeVisible();
    await expect(card.getByText("Ready")).toBeVisible();
    await expect(card.getByText("AI analysis streaming")).toBeHidden();
    await expect(card.getByText("Status: Pipeline #117 latest run succeeded.")).toBeVisible();
    await expect(card.locator("li").filter({ hasText: "Risk: low" })).toBeVisible();
    await expect(card.locator("code").filter({ hasText: "20260706.1" })).toBeVisible();
    await page.getByRole("button", { name: "Open analysis" }).click();
    const detailPanel = page.locator("aside").filter({ hasText: "Pipeline detail" });
    await expect(detailPanel.getByText("AI analysis")).toBeVisible();
    await expect(detailPanel.getByText("Status: Pipeline #117 latest run succeeded.")).toBeVisible();
    await expect(detailPanel.locator("li").filter({ hasText: "Evidence preserved" })).toBeVisible();
    await expect(detailPanel.locator("code").filter({ hasText: "20260706.1" })).toBeVisible();
    await expect(detailPanel.getByText("Run evidence")).toBeVisible();
    await expect(detailPanel.locator("li").filter({ hasText: "Open run" }).filter({ hasText: "20260706.1" })).toBeVisible();
    await expect(detailPanel.getByText("Unknown")).toBeHidden();
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

  test("@smoke @mocked presents Activity as scoped operational history sections", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/tasks", async (route) => {
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
    let checkpointItems = [checkpointActivity];
    await page.route("http://127.0.0.1:8787/chat/checkpoints", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(checkpointItems),
      });
    });
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/review-operations`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [reviewOperation] }),
        });
      },
    );
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/pr-insights`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [prInsightActivity], history: [] }),
        });
      },
    );

    await page.goto("/#/activity");

    const sidebar = page.locator("section").filter({ hasText: "Operational history by source." }).first();
    await expect(sidebar.getByRole("heading", { name: "Runs" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Checkpoints" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "PR Insights" })).toBeVisible();
    await expect(sidebar.getByRole("heading", { name: "Review Operations" })).toBeVisible();
    await expect(sidebar.getByText("No agent runs recorded yet.")).toBeHidden();
    await expect(sidebar.getByText("No Git checkpoints yet.")).toBeHidden();
    await expect(sidebar.getByText("No saved PR insights yet.")).toBeHidden();
    await expect(sidebar.getByText("No review operations yet.")).toBeHidden();
    await expect(sidebar.getByRole("button", { name: /Pipeline submission:/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /git_add/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /#2670 · Review ClaimBot_API error handling/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /#2670 · Review run completed/ })).toBeVisible();

    await sidebar.getByRole("button", { name: /^Checkpoints\s+1$/ }).click();
    await expect(sidebar.getByRole("heading", { name: "Checkpoints" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /git_add/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Pipeline submission:/ })).toBeHidden();
    await expect(sidebar.getByRole("button", { name: /#2670 · Review ClaimBot_API error handling/ })).toBeHidden();
    await expect(sidebar.getByRole("button", { name: /#2670 · Review run completed/ })).toBeHidden();
    await expect(page.getByText("Git checkpoint before confirmed action")).toBeVisible();
    await expect(page.getByText("Repository")).toBeVisible();
    await expect(page.getByText("Session")).toBeVisible();

    checkpointItems = [];
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(sidebar.getByText("No Git checkpoints yet.")).toBeVisible();
    await expect(page.getByText("No operation selected")).toBeVisible();

    await sidebar.getByRole("button", { name: /^All\s+3$/ }).click();
    await expect(sidebar.getByRole("button", { name: /Pipeline submission:/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /#2670 · Review ClaimBot_API error handling/ })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /#2670 · Review run completed/ })).toBeVisible();
    await expect(sidebar.getByText("No Git checkpoints yet.")).toBeVisible();

    await expect(page.getByText('{"returncode":0')).toBeHidden();
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
    const toolResultSection = page.locator("section").filter({ hasText: "Tool Result" });
    await expect(toolResultSection.getByText("M README.md", { exact: true })).toBeVisible();
    await expect(page.getByText('{"returncode":0')).toBeHidden();
    await page.getByText("Raw output").click();
    await expect(page.getByText('{"returncode":0')).toBeVisible();
  });

  test("@smoke @mocked summarizes structured review-operation details before raw JSON", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    const validationOperation = {
      ...reviewOperation,
      id: "review-op-validation-error",
      label: "Review validation failed",
      ok: false,
      details: JSON.stringify({
        error: {
          fieldErrors: {
            sessionId: ["Expected string, received null"],
          },
          formErrors: [],
        },
      }),
    };
    await page.route(
      `http://127.0.0.1:8787/project-links/${projectLink.id}/review-operations`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [validationOperation] }),
        });
      },
    );

    await page.goto("/#/activity");
    const sidebar = page.locator("section").filter({ hasText: "Operational history by source." }).first();
    await sidebar.getByRole("button", { name: /^Reviews\s+1$/ }).click();
    await sidebar.getByRole("button", { name: /#2670 · Review validation failed/ }).click();

    const reviewDetail = page
      .getByRole("heading", { name: "Review validation failed" })
      .locator("xpath=ancestor::div[contains(@class, 'space-y-5')][1]");
    await expect(reviewDetail).toBeVisible();
    await expect(reviewDetail.getByText("sessionId: Expected string, received null", { exact: true })).toBeVisible();
    await expect(page.getByText('"fieldErrors"')).toBeHidden();
    await page.getByText("Raw detail").click();
    await expect(page.getByText('"fieldErrors"')).toBeVisible();
  });
});
