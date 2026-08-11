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
  reviewers: ["Zhou Ping"],
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
  signals: {
    fileCount: 4,
    threadCount: 2,
    failedBuildCount: 1,
    failedPolicyCount: 0,
    workItemCount: 1,
  },
  tokensIn: 900,
  tokensOut: 260,
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
  // Opening an insight card also requests a fresh preview; keep it hermetic.
  await page.route(
    /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/pull-requests\/\d+\/insight-preview/,
    async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "mocked insight preview unavailable" }),
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

    await page.getByRole("link", { name: "Delivery" }).click();
    await expect(page.getByLabel("Loading pipelines")).toBeHidden();
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    releaseProjectLinks?.();
  });

  test("@smoke @mocked lays out saved Project Links as a responsive card grid", async ({
    page,
  }) => {
    const thirdProjectLink = {
      ...projectLink,
      id: "tertiary-cache-project-link",
      name: "Tertiary link",
      repoPath: "C:\\Users\\15492\\Develop\\ThirdRepo",
      adoRepoName: "ThirdRepo",
      adoPipelineId: "119",
      adoPipelineName: "ThirdRepo",
    };
    await mockBaseRuntime(page, {
      projectLinks: [projectLink, secondaryProjectLink, thirdProjectLink],
    });
    await page.setViewportSize({ width: 1366, height: 760 });

    await page.goto("/#/project-links", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Project Links" })).toBeVisible();
    const primaryRepoLabel = page.getByTitle(projectLink.repoPath);
    const secondaryRepoLabel = page.getByTitle(secondaryProjectLink.repoPath);
    const tertiaryRepoLabel = page.getByTitle(thirdProjectLink.repoPath);
    const primaryCard = primaryRepoLabel.locator("xpath=ancestor::div[contains(@class,'group')][1]");
    const secondaryCard = secondaryRepoLabel.locator("xpath=ancestor::div[contains(@class,'group')][1]");
    const tertiaryCard = tertiaryRepoLabel.locator("xpath=ancestor::div[contains(@class,'group')][1]");
    await expect(primaryCard).toBeVisible();
    await expect(secondaryCard).toBeVisible();
    await expect(tertiaryCard).toBeVisible();
    await expect(primaryRepoLabel).toHaveText("ClaimBot_API");
    await expect.poll(async () =>
      primaryCard.evaluate((element) => element.textContent ?? ""),
    ).not.toContain(projectLink.repoPath);
    await expect.poll(async () =>
      primaryCard.evaluate((element) => element.textContent ?? ""),
    ).not.toContain(projectLink.adoOrgUrl);
    await expect.poll(async () => {
      const [primaryBox, secondaryBox, tertiaryBox] = await Promise.all([
        primaryCard.boundingBox(),
        secondaryCard.boundingBox(),
        tertiaryCard.boundingBox(),
      ]);
      if (!primaryBox || !secondaryBox || !tertiaryBox) return false;
      return (
        secondaryBox.x > primaryBox.x + primaryBox.width - 8 &&
        tertiaryBox.x > secondaryBox.x + secondaryBox.width - 8 &&
        Math.abs(primaryBox.y - secondaryBox.y) <= 12 &&
        Math.abs(primaryBox.y - tertiaryBox.y) <= 12
      );
    }).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    // At 900px the shell sidebar collapses to its compact rail, which keeps
    // the card grid wide enough for two columns; 760px forces the cards to
    // stack into a single column.
    await page.setViewportSize({ width: 760, height: 760 });
    await expect.poll(async () => {
      const [primaryBox, secondaryBox] = await Promise.all([
        primaryCard.boundingBox(),
        secondaryCard.boundingBox(),
      ]);
      if (!primaryBox || !secondaryBox) return false;
      return secondaryBox.y > primaryBox.y + primaryBox.height - 8;
    }).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });

  test("@smoke @mocked keeps New Chat empty state quiet without index-status preload", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 1600, height: 920 });
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
    await expect(page.getByText("Start with a focused prompt")).toBeVisible();
    const reviewPrompt = page.getByRole("button", { name: "Use prompt: Review ClaimBot_API changes" });
    await expect(reviewPrompt).toBeVisible();
    const welcomePanel = page.locator('[aria-label="New conversation welcome"]');
    await expect(welcomePanel).toBeVisible();
    await expect.poll(async () => {
      const box = await welcomePanel.boundingBox();
      return box ? Math.round(box.width) : 0;
    }).toBeGreaterThan(760);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await page.waitForTimeout(120);
    expect(indexStatusRequests).toBe(0);
    await expect(reviewPrompt).toBeVisible();
    await expect(page.getByText("Start with a focused prompt")).toBeVisible();
    await page.setViewportSize({ width: 760, height: 760 });
    await expect(reviewPrompt).toBeVisible();
    await expect(page.getByText("Start with a focused prompt")).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
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
    const mapPrompt = page.getByRole("button", { name: "Use prompt: Map ClaimBot_API entry points" });
    await expect(mapPrompt).toBeVisible();
    await expect(page.getByText(
      `Suggestions use the selected ${projectLink.name} context. Edit the prompt before MergePilot does any work.`,
      { exact: true },
    )).toBeVisible();
    await expect(page.locator('select[aria-label="Composer Project Link"]')).toHaveCount(0);
    await expect(mapPrompt).toBeVisible();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await page.waitForTimeout(120);
    expect(secondaryIndexRequests).toBe(0);
    await expect(mapPrompt).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Use prompt: Review ClaimBot_API changes" })).toBeVisible();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);

    await page.goto("/#/activity");
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

    await page.getByRole("link", { name: "New chat" }).click();
    await page.waitForTimeout(80);
    await expect(page.getByRole("button", { name: "Use prompt: Review ClaimBot_API changes" })).toBeVisible();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
  });

  test("@smoke @mocked keeps Settings rows responsive in a narrow desktop window", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 900, height: 760 });
    await page.route(/http:\/\/(127\.0\.0\.1|localhost):8787\/daemon\/configure/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, llmConfigured: true }),
      });
    });

    await page.goto("/#/settings", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
    await page.getByRole("button", { name: "Capabilities", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Capabilities" })).toBeVisible();
    await page.getByRole("button", { name: "Additional Models", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Additional Models" })).toBeVisible();
    await page.getByRole("button", { name: "System", exact: true }).click();
    await expect(page.getByRole("heading", { name: "System" })).toBeVisible();
    // Runtime details live in a collapsed disclosure; open it before reading rows.
    await page.getByText("Runtime details").click();
    await expect(page.getByText("Daemon runtime")).toBeVisible();
    await expect(page.getByText("Sidecar owner")).toBeVisible();
    await expect(page.getByText("No runtime mode")).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    await page.setViewportSize({ width: 1366, height: 760 });
    await expect.poll(async () =>
      page.evaluate(() => {
        const settingsPage = document.querySelector(".settings-page");
        return settingsPage ? Math.round(settingsPage.getBoundingClientRect().width) : 0;
      }),
    ).toBeGreaterThan(1030);
    await expect.poll(async () =>
      page.evaluate(() => {
        const shell = document.querySelector(".settings-shell")?.getBoundingClientRect();
        const content = document.querySelector(".settings-content")?.getBoundingClientRect();
        return Boolean(shell && content && content.width > shell.width * 0.6);
      }),
    ).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => {
        const desktopRow = Array.from(document.querySelectorAll("div.grid")).find((row) => {
          const title = row.querySelector("p")?.textContent?.trim();
          return title === "Desktop build";
        });
        const rowRect = desktopRow?.getBoundingClientRect();
        const controlRect = desktopRow
          ?.querySelector(":scope > div.flex")
          ?.getBoundingClientRect();
        if (!rowRect || !controlRect) return false;
        return controlRect.x > rowRect.x + rowRect.width * 0.45;
      }),
    ).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    await page.getByRole("button", { name: "Additional Models", exact: true }).click();
    await page.getByRole("button", { name: "Add model" }).click();
    await expect(page.getByText("Azure OpenAI")).toBeVisible();
    await expect(page.getByRole("button", { name: "Test connection" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });

  test("@smoke @mocked keeps Microsoft sign-in dialog responsive with long Azure errors", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.route("http://127.0.0.1:8787/healthz", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          llmConfigured: true,
          cloudSessions: true,
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/auth/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false }),
      });
    });
    await page.route("http://127.0.0.1:8787/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false }),
      });
    });
    await page.route("http://127.0.0.1:8787/auth/accounts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accounts: [] }),
      });
    });
    await page.route("http://127.0.0.1:8787/auth/login", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          message:
            "invalid_client: AADSTS650057: Invalid resource. The client requested access to a resource which is not listed in the requested permissions in the client's application registration. Client app ID: 03da33ef-7161-4b27-ae80-3079313f131d.",
        }),
      });
    });

    await page.goto("/#/chat", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Sign in with Microsoft" }).click();
    const panel = page.getByTestId("login-modal-panel");
    await expect(panel).toBeVisible();
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      return box ? Math.ceil(box.width) : 999;
    }).toBeLessThanOrEqual(328);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    await panel.getByRole("button", { name: "Sign in with Microsoft" }).click();
    await expect(panel.getByText("AADSTS650057")).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });

  test("@smoke @mocked keeps cached Pull Requests visible while refresh is pending", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 900, height: 760 });
    let delayRefresh = false;
    let releaseRefresh: (() => void) | undefined;
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\/\d+\/context/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            source: "internal",
            pullRequest: {
              ...pullRequest,
              description: "**Scope**\n\n- Review responsive context panel.",
              codeReviewId: pullRequest.id,
              project: projectLink.adoProject,
              closedDate: "",
              workItemRefs: [{ id: "42", url: "https://tebssg.visualstudio.com/workitems/42" }],
            },
            threads: [
              {
                id: 10,
                status: "active",
                comments: [
                  {
                    author: { displayName: "Reviewer", uniqueName: "reviewer@example.test" },
                    content: "Please verify this layout in a resized window.",
                  },
                ],
              },
            ],
            changes: {
              iterationId: 1,
              sourceCommit: "abc1234567",
              targetCommit: "def5678",
              commonCommit: "0000000",
              fileCount: 1,
              changes: [
                {
                  changeId: 1,
                  changeType: "edit",
                  path: "/src/pages/pullRequests/PullRequestContextPanel.tsx",
                },
              ],
            },
            builds: [
              {
                id: 4680,
                buildNumber: "20260719.1",
                definitionName: "ClaimBot_API",
                status: "completed",
                result: "succeeded",
                sourceBranch: "refs/heads/main",
                queueTime: "2026-07-19T06:00:00.000Z",
                finishTime: "2026-07-19T06:02:00.000Z",
                url: "https://tebssg.visualstudio.com/_build/results?buildId=4680",
              },
            ],
          }),
        });
      },
    );

    await page.goto("/#/pulls");
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    await expect(page.getByLabel("Pull Requests Project Link")).toHaveCount(0);
    await expect(page.getByLabel("Pull Requests status")).toBeVisible();
    await expect(page.getByText("Author:", { exact: true })).toBeVisible();
    await expect(page.getByText("Reviewers:", { exact: true })).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 760, height: 760 });
    await expect(page.getByLabel("Pull Requests Project Link")).toHaveCount(0);
    await expect(page.getByLabel("Pull Requests status")).toBeVisible();
    await expect(page.getByText("Author:", { exact: true })).toBeVisible();
    await expect(page.getByText("Reviewers:", { exact: true })).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.getByRole("button", { name: "Load details" }).click();
    await expect(page.getByText("Recent Threads")).toBeVisible();
    await expect(page.getByText("Build History")).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
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
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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

  test("@smoke @mocked lays out Pull Request cards as a stacked list", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pullRequests: [
              pullRequest,
              {
                ...pullRequest,
                id: 2671,
                title: "Review README documentation updates",
                sourceBranch: "codex/testing-autopr",
              },
            ],
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

    await page.setViewportSize({ width: 1366, height: 760 });
    await page.goto("/#/pulls");
    await expect(page.locator("article")).toHaveCount(2);
    // The Changes workspace lists PR cards in a single vertical column.
    await expect.poll(async () =>
      page.locator("article").evaluateAll((cards) => {
        if (cards.length < 2) return false;
        const [first, second] = cards.map((card) => card.getBoundingClientRect().top);
        return Math.abs((first ?? 0) - (second ?? 0)) >= 4;
      }),
    ).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    await page.setViewportSize({ width: 760, height: 760 });
    await expect.poll(async () =>
      page.locator("article").evaluateAll((cards) => {
        if (cards.length < 2) return false;
        const [first, second] = cards.map((card) => card.getBoundingClientRect().top);
        return Math.abs((first ?? 0) - (second ?? 0)) >= 4;
      }),
    ).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });

  test("@smoke @mocked keeps empty Pull Requests guidance responsive", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 760, height: 760 });
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [] }),
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

    await expect(page.getByText("No pull requests found")).toBeVisible();
    await expect(
      page.getByText("Change the Project Link or status filter, or use Refresh above after creating a pull request."),
    ).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
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
    await expect(page.getByLabel("Loading Project Links")).toBeVisible();
    await expect(page.getByText("Checking repository mappings")).toBeVisible();
    await expect(page.getByLabel("Preparing pull requests")).toBeHidden();
    await expect(page.getByText("No pull requests found")).toBeHidden();
    releaseProjectLinks?.();
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
  });

  test("@smoke @mocked does not show stale Pull Requests after Project Link switch", async ({
    page,
  }) => {
    await mockBaseRuntime(page, { projectLinks: [projectLink, secondaryProjectLink] });
    // No addInitScript here: the active link is resolved from the stored
    // value, and an init script would re-seed the primary id on reload and
    // clobber the switch below.
    let releaseSecondaryPulls: (() => void) | undefined;
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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
    // The Pull Requests header no longer switches Project Links; the page
    // follows the active Project Link selected in Context, so the switch is
    // driven through shared storage.
    await page.evaluate((id) => {
      localStorage.setItem("mergepilot_active_project_link_id", id);
    }, secondaryProjectLink.id);
    await page.reload();
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
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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
    await expect(page.getByText("Azure DevOps sign-in needs attention")).toBeVisible();
    await expect(page.getByText("/project-links/")).toBeHidden();
    await expect(page.getByText("HTTP 401")).toBeHidden();
    await page.getByRole("link", { name: "New chat" }).click();
    await page.getByRole("link", { name: "Changes" }).click();
    await expect(page.getByText("Loading pull requests...")).toBeHidden();
    await expect(page.getByText("Azure DevOps sign-in needs attention")).toBeVisible();
    await expect(page.getByText("/project-links/")).toBeHidden();
    await expect(page.getByText("HTTP 401")).toBeHidden();
  });

  test("@smoke @mocked shows readable PR insight scope instead of internal Project Link id", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 900, height: 760 });
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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
    await expect(latestInsight.locator("li")).toHaveCount(0);
    await expect(latestInsight.locator("code")).toHaveCount(0);
    await expect(latestInsight).not.toContainText("Risk: low");
    await expect(latestInsight).not.toContainText("CommonFunctions.cs");
    await expect(latestInsight).not.toContainText("**Status:**");
    await expect.poll(async () =>
      prCard.evaluate((element) => Math.round(element.getBoundingClientRect().height)),
    ).toBeLessThanOrEqual(280);
    await page.getByRole("button", { name: "Open insight" }).click();
    const sidePanel = page.getByRole("dialog");
    await expect(sidePanel).toBeVisible();
    await expect.poll(async () =>
      sidePanel.evaluate((element) => getComputedStyle(element).position),
    ).toBe("fixed");
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 1100, height: 760 });
    await expect.poll(async () =>
      sidePanel.evaluate((element) => getComputedStyle(element).position),
    ).toBe("fixed");
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 1366, height: 760 });
    await expect.poll(async () =>
      sidePanel.evaluate((element) => getComputedStyle(element).position),
    ).toBe("fixed");
    await expect.poll(async () => {
      const box = await sidePanel.boundingBox();
      return box ? Math.round(box.width) : 0;
    }).toBeGreaterThanOrEqual(350);
    await expect.poll(async () => {
      const box = await sidePanel.boundingBox();
      return box ? Math.round(box.width) : 999;
    }).toBeLessThanOrEqual(600);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(sidePanel.getByText("Last AI Insight")).toBeVisible();
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
    await page.setViewportSize({ width: 900, height: 760 });
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
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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
    const workspaceSection = page.locator("section").filter({ hasText: "Workspace" }).first();
    const adoSection = page.locator("section").filter({ hasText: "Azure DevOps" }).first();
    await page.setViewportSize({ width: 1366, height: 760 });
    await expect.poll(async () => {
      const [workspaceBox, adoBox] = await Promise.all([
        workspaceSection.boundingBox(),
        adoSection.boundingBox(),
      ]);
      if (!workspaceBox || !adoBox) return false;
      return adoBox.x > workspaceBox.x + workspaceBox.width - 8 && Math.abs(workspaceBox.y - adoBox.y) <= 12;
    }).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 900, height: 760 });
    await expect.poll(async () => {
      const [workspaceBox, adoBox] = await Promise.all([
        workspaceSection.boundingBox(),
        adoSection.boundingBox(),
      ]);
      if (!workspaceBox || !adoBox) return false;
      return adoBox.y > workspaceBox.y + workspaceBox.height - 8 && Math.abs(workspaceBox.x - adoBox.x) <= 12;
    }).toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.getByLabel("Repo path").fill(editedProjectLink.repoPath);
    await page.getByLabel("Repository name").fill(editedProjectLink.adoRepoName);
    await page.getByRole("button", { name: "Save Project Link" }).click();
    await expect(page.getByRole("heading", { name: "Project Links" })).toBeVisible();

    await page.getByRole("link", { name: "Changes" }).click();
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
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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
    await expect(page.getByText("Primary duplicate PR")).toBeVisible();
    await expect(page.getByText("Secondary duplicate PR")).toHaveCount(0);
    // The Pull Requests header no longer offers an "all links" aggregate; the
    // page follows the active Project Link, so switch through shared storage
    // and verify each link keeps its own distinct PR #2670.
    await page.evaluate((id) => {
      localStorage.setItem("mergepilot_active_project_link_id", id);
    }, secondaryProjectLink.id);
    await page.reload();
    await expect(page.getByText("Secondary duplicate PR")).toBeVisible();
    const secondaryCard = page.locator("article").filter({ hasText: "Secondary duplicate PR" });
    await secondaryCard.getByRole("button", { name: "Open insight" }).click();
    const sidePanel = page.getByRole("dialog");
    await expect(sidePanel.getByText("#2670 Secondary duplicate PR")).toBeVisible();
    await expect(sidePanel.getByText("Scope: Secondary link")).toBeVisible();
    await expect(sidePanel.getByText("Secondary insight.")).toBeVisible();
    await expect(sidePanel.getByText("Primary insight.")).toBeHidden();
  });

  test("@smoke @mocked redirects /findings to Changes after Review Queue removal", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page).toHaveURL(/#\/pulls/);
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    await expect(page.getByText("Warnings need human review.")).toHaveCount(0);
    await expect(page.getByText("Refreshing review decisions...")).toHaveCount(0);
  });

  test("@smoke @mocked does not show an empty Changes page before Project Links resolve", async ({
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

    await page.goto("/#/findings");
    await expect(page.getByLabel("Loading Project Links")).toBeVisible();
    await expect(page.getByText("Checking repository mappings")).toBeVisible();
    await expect(page.getByText("Auto-approved")).toHaveCount(0);
    await expect(page.getByText("No review decisions found")).toHaveCount(0);
    releaseProjectLinks?.();
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
  });

  test("@smoke @mocked Review Queue is no longer navigable after removal", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_active_project_link_id", "cache-project-link");
    });
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
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

    await expect(page.getByRole("link", { name: "Review Queue" })).toHaveCount(0);
    await page.goto("/#/findings");
    await expect(page).toHaveURL(/#\/pulls/);
    await expect(page.getByText("Azure DevOps sign-in needs attention")).toBeVisible();
    await page.getByRole("link", { name: "New chat" }).click();
    await page.getByRole("link", { name: "Changes" }).click();
    await expect(page.getByText("Loading pull requests...")).toBeHidden();
    await expect(page.getByText("Azure DevOps sign-in needs attention")).toBeVisible();
  });

  test("@smoke @mocked Review Queue storage errors never surface on Changes", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
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
    await expect(page).toHaveURL(/#\/pulls/);
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    await expect(page.getByLabel("Review Queue Project Link")).toHaveCount(0);
    await expect(page.getByText("Azure Table Storage access is not available")).toHaveCount(0);
  });

  test("@smoke @mocked Review Queue decisions never render on the Changes target", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/review-queue/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ configured: false, storage: "local", items: [reviewQueueItem] }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page).toHaveURL(/#\/pulls/);
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    await expect(page.getByText("Warnings need human review.")).toHaveCount(0);
    await expect(page.getByLabel("Review Queue Project Link")).toHaveCount(0);
    await expect(page.getByLabel("Preparing review queue")).toHaveCount(0);
  });

  test("@smoke @mocked Review Findings surfaces are gone from the redirect target", async ({
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
    await page.route(
      /http:\/\/(127\.0\.0\.1|localhost):8787\/project-links\/[^/]+\/pull-requests\?status=.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ pullRequests: [pullRequest] }),
        });
      },
    );

    await page.goto("/#/findings");
    await expect(page).toHaveURL(/#\/pulls/);
    await expect(page.getByText("Update CommonFunctions.cs and ClaimController.cs")).toBeVisible();
    await expect(page.getByRole("button", { name: /View findings/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Review Findings/ })).toHaveCount(0);
    await expect(page.getByLabel("Review Queue Project Link")).toHaveCount(0);
  });

  test("@smoke @mocked keeps cached pipeline rows visible while discovery refreshes", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 900, height: 760 });
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
        body: JSON.stringify({
          items: [
            { id: "117", name: "ClaimBot_API" },
            { id: "118", name: "ClaimBot_API secondary" },
          ],
        }),
      });
    });

    await page.goto("/#/pipelines");
    await expect(page.getByRole("heading", { name: "ClaimBot_API", exact: true })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Pipeline status filters" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Discovered\s+2/ })).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 1366, height: 760 });
    await expect(page.getByTestId("pipeline-row-card")).toHaveCount(2);
    await expect
      .poll(async () =>
        page.getByTestId("pipeline-row-card").evaluateAll((cards) => {
          if (cards.length < 2) return false;
          const [first, second] = cards.map((card) => card.getBoundingClientRect().top);
          return Math.abs((first ?? 0) - (second ?? 0)) < 4;
        }),
      )
      .toBe(true);
    await page.setViewportSize({ width: 760, height: 760 });
    await expect(page.getByRole("toolbar", { name: "Pipeline status filters" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Discovered\s+2/ })).toBeVisible();
    await expect
      .poll(async () =>
        page.getByTestId("pipeline-row-card").evaluateAll((cards) => {
          if (cards.length < 2) return false;
          const [first, second] = cards.map((card) => card.getBoundingClientRect().top);
          return Math.abs((first ?? 0) - (second ?? 0)) >= 4;
        }),
      )
      .toBe(true);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    delayDiscovery = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("Refreshing pipeline discovery...")).toBeVisible();
    await expect(page.getByRole("heading", { name: "ClaimBot_API", exact: true })).toBeVisible();
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
    await expect(page.getByLabel("Loading pipelines")).toBeVisible();
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
    const detailPanel = page.getByRole("dialog");
    await expect(detailPanel).toBeVisible();
    await expect(detailPanel.getByText("Pipeline action failed")).toBeVisible();
    await expect(detailPanel.getByText("Pipeline inspection failed: ADO permission denied")).toBeVisible();
    await expect(detailPanel.getByText("/chat/workflow-action")).toBeHidden();
    await expect(detailPanel.getByText("HTTP 500")).toBeHidden();
  });

  test("@smoke @mocked AI analyze opens the run Inspector instead of inline analysis", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "saved-connection-117",
            projectLinkId: projectLink.id,
            pipelineId: "117",
            pipelineName: "ClaimBot_API",
            purpose: "ci",
            isDefault: true,
          },
        ]),
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
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/delivery\/evidence\/\d+.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            build: {
              id: 4680,
              buildNumber: "20260706.1",
              status: "completed",
              result: "failed",
              branch: "refs/heads/main",
              sourceVersion: "0649066f311f",
              definitionName: "ClaimBot_API",
            },
            timelineIssues: [{ taskName: "VSTest", result: "failed" }],
            errorIssues: [{ type: "VSTest", message: "2 tests failed" }],
            logExcerpts: [],
            signature: {
              definitionId: 117,
              taskName: "VSTest",
              errorClass: "test_failure",
              normalizedText: "2 tests failed",
            },
            classification: {
              class: "flaky_test",
              confidence: 0.75,
              decisiveEvidence: ["VSTest failed on run 20260706.1"],
              missingEvidence: [],
            },
            coverage: "complete",
          }),
        });
      },
    );

    await page.goto("/#/pipelines");
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    await page.getByRole("button", { name: "AI analyze" }).click();
    const inspector = page.getByRole("dialog");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("Run 4680")).toBeVisible();
    await expect(inspector.getByText("20260706.1", { exact: true })).toBeVisible();
    await expect(inspector.getByText("VSTest failed on run 20260706.1")).toBeVisible();
    await expect(inspector.getByText(/Flaky test/)).toBeVisible();
    // The row card never renders an inline AI analysis section for this action.
    const card = page.locator("article").filter({ hasText: "ClaimBot_API" });
    await expect(card.getByText("AI analysis")).toHaveCount(0);
    await expect(page.getByText("Runs inspected:")).toHaveCount(0);
  });

  test("@smoke @mocked renders run Inspector evidence with classification and recovery actions", async ({
    page,
  }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 900, height: 760 });
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "saved-connection-117",
            projectLinkId: projectLink.id,
            pipelineId: "117",
            pipelineName: "ClaimBot_API",
            purpose: "ci",
            isDefault: true,
          },
        ]),
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
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/delivery\/evidence\/\d+.*/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            build: {
              id: 4680,
              buildNumber: "20260706.1",
              status: "completed",
              result: "succeeded",
              branch: "refs/heads/main",
              sourceVersion: "0649066f311f",
              definitionName: "ClaimBot_API",
            },
            timelineIssues: [],
            errorIssues: [],
            logExcerpts: [
              {
                taskName: "CSC",
                excerpt: "error CS0103: The name 'token' does not exist",
                contentHash: "abc123",
              },
            ],
            signature: {
              definitionId: 117,
              taskName: "CSC",
              errorClass: "compile_error",
              normalizedText: "error CS0103",
            },
            classification: {
              class: "code_regression",
              confidence: 0.9,
              decisiveEvidence: ["Compile error in CommonFunctions.cs"],
              missingEvidence: [],
            },
            coverage: "complete",
          }),
        });
      },
    );

    await page.goto("/#/pipelines");
    await expect(page.getByRole("heading", { name: "ClaimBot_API" })).toBeVisible();
    await page.getByRole("button", { name: "AI analyze" }).click();
    const inspector = page.getByRole("dialog");
    await expect.poll(async () =>
      inspector.evaluate((element) => getComputedStyle(element).position),
    ).toBe("fixed");
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 1100, height: 760 });
    await expect.poll(async () =>
      inspector.evaluate((element) => getComputedStyle(element).position),
    ).toBe("fixed");
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 1366, height: 760 });
    await expect.poll(async () =>
      inspector.evaluate((element) => getComputedStyle(element).position),
    ).toBe("fixed");
    await expect.poll(async () => {
      const box = await inspector.boundingBox();
      return box ? Math.round(box.width) : 0;
    }).toBeGreaterThanOrEqual(350);
    await expect.poll(async () => {
      const box = await inspector.boundingBox();
      return box ? Math.round(box.width) : 999;
    }).toBeLessThanOrEqual(600);
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(inspector.getByText("Run 4680")).toBeVisible();
    await expect(inspector.getByText("20260706.1", { exact: true })).toBeVisible();
    await expect(inspector.getByText("Succeeded")).toBeVisible();
    await expect(inspector.getByText(/Code regression/)).toBeVisible();
    await expect(inspector.getByText("Decisive evidence")).toBeVisible();
    await expect(inspector.locator("li").filter({ hasText: "Compile error in CommonFunctions.cs" })).toBeVisible();
    await expect(inspector.getByRole("button", { name: "Rerun pipeline" })).toBeVisible();
    await expect(inspector.getByRole("button", { name: "Create Bug" })).toBeVisible();
    await expect(inspector.getByText("Unknown")).toBeHidden();
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
    const detailPanel = page.getByRole("dialog");
    await expect(detailPanel).toBeVisible();
    await expect(detailPanel.getByText("Pipeline action failed")).toBeVisible();
    // The detail drawer is modal and blocks the filter toolbar; close it
    // first, then filter the failed row out.
    await detailPanel.getByRole("button", { name: /^Close/ }).click();
    await expect(detailPanel).toBeHidden();
    await page.getByRole("button", { name: /Failed\s+0/ }).click();
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
    // The auto-selected detail drawer is modal (it aria-hides the sidebar),
    // so the Refresh control is asserted with DOM-based locators. Activity
    // re-polls /tasks every 10 seconds: arm the route gate so the next poll
    // acts as the pending refresh; clicking Refresh directly would race the
    // disabled "Refreshing..." button state.
    delayRefresh = true;
    await expect(page.locator("button").filter({ hasText: "Refreshing..." })).toBeVisible({
      timeout: 12000,
    });
    await expect(taskButton).toBeVisible();
    await expect(page.getByText("Loading activity...")).toBeHidden();
    releaseRefresh?.();
    await expect(page.locator("button").filter({ hasText: /^Refresh$/ })).toBeVisible();
    await expect(taskButton).toBeVisible();
  });

  test("@smoke @mocked presents Activity as scoped operational history sections", async ({ page }) => {
    await mockBaseRuntime(page);
    await page.setViewportSize({ width: 1366, height: 900 });
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
    await page.route("http://127.0.0.1:8787/chat/checkpoints", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([checkpointActivity]),
      });
    });
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

    // The newest activity is auto-selected into a modal detail drawer that
    // aria-hides the page, so the sidebar assertions below use DOM-based
    // locators that ignore the accessibility tree.
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^Close/ })).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(page.locator("h3").filter({ hasText: "Runs" })).toBeVisible();
    await expect(page.locator("h3").filter({ hasText: "Checkpoints" })).toBeVisible();
    await expect(page.locator("h3").filter({ hasText: "PR Insights" })).toBeVisible();
    // Review Operations was removed with the Review Queue; the heading and
    // its empty state must never render.
    await expect(page.locator("h3").filter({ hasText: "Review Operations" })).toHaveCount(0);
    await expect(page.getByText("No review operations yet.")).toHaveCount(0);
    await expect(page.getByText("No agent runs recorded yet.")).toBeHidden();
    await expect(page.getByText("No Git checkpoints yet.")).toBeHidden();
    await expect(page.getByText("No saved PR insights yet.")).toBeHidden();
    await expect(page.locator("button").filter({ hasText: "Pipeline submission:" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "git_add" })).toBeVisible();
    await expect(
      page.locator("button").filter({ hasText: "#2670 · Review ClaimBot_API error handling" }),
    ).toBeVisible();
    // Section filter chips: All / Runs / Git / PR.
    await expect(page.getByLabel("Activity sections").locator("button")).toHaveCount(4);

    await page.setViewportSize({ width: 1100, height: 760 });
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    await page.setViewportSize({ width: 760, height: 760 });
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    await expect(page.getByText('{"returncode":0')).toBeHidden();

    await page.setViewportSize({ width: 900, height: 760 });
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
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
      /http:\/\/127\.0\.0\.1:8787\/chat\/checkpoints\/[^/]+\/preview\?maxDiffChars=12000/,
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
      /http:\/\/127\.0\.0\.1:8787\/chat\/checkpoints\/[^/]+\/rollback-plan/,
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
    // The only checkpoint is auto-selected on load, opening the detail drawer.
    await expect(page.getByRole("heading", { name: "Git checkpoint" })).toBeVisible();
    const toolResultSection = page
      .locator("section")
      .filter({ has: page.locator("h3", { hasText: "Tool Result" }) });
    await expect(toolResultSection.getByText("M README.md", { exact: true })).toBeVisible();
    await expect(page.getByText("Branch", { exact: true })).toBeVisible();
    await expect(page.getByText("Files", { exact: true })).toBeVisible();
    await expect(page.getByText("Diff", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 760, height: 760 });
    await expect(page.getByText("Branch", { exact: true })).toBeVisible();
    await expect(page.getByText("Diff", { exact: true })).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await expect(page.getByText('{"returncode":0')).toBeHidden();
    await page.getByText("Raw output").click();
    await expect(page.getByText('{"returncode":0')).toBeVisible();
  });

});
