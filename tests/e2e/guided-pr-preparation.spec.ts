import { expect, type Page, test } from "@playwright/test";

const profile = {
  id: "guided-pr-profile",
  name: "ClaimBot_API fixture",
  repoPath: "C:\\fixtures\\ClaimBot_API",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://dev.azure.com/demo-org",
  adoProject: "ClaimBot",
  adoRepoName: "ClaimBot_API",
  adoPat: "",
  adoPipelineId: "117",
  adoPipelineName: "ClaimBot CI",
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

const sourceBranch = "mergepilot-e2e/guided-pr-v1";
const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const targetSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function preparation(validationPassed: boolean) {
  return {
    projectLinkId: profile.id,
    repositoryId: "claimbot-repository-guid",
    generatedAt: 1_786_000_000_000,
    git: {
      repoPath: profile.repoPath,
      sourceBranch,
      targetBranch: "main",
      headSha,
      targetSha,
      remoteSourceSha: headSha,
      remoteTargetSha: targetSha,
      upstream: `origin/${sourceBranch}`,
      ahead: 1,
      behind: 0,
      dirty: false,
      changedFiles: [".mergepilot-e2e/guided-pr-v1.md"],
      diffStat: "1 file changed, 4 insertions(+)",
      commits: [{ sha: headSha, subject: "[MergePilot Fixture] guided PR evidence" }],
      targetAvailability: "available",
    },
    validation: validationPassed
      ? {
          status: "passed",
          command: "MSBuild.exe BotToSharePoint.sln /t:Build /p:Configuration=Release",
          summary: "Current source SHA validation passed.",
          sourceSha: headSha,
          durationMs: 1842,
          outputExcerpt: "Build succeeded. 0 Warning(s) 0 Error(s)",
        }
      : {
          status: "not_run",
          summary: "Validation has not run for the current source SHA.",
          sourceSha: headSha,
        },
    workItem: {
      status: "available",
      item: {
        id: 8123,
        revision: 7,
        type: "Task",
        title: "[MergePilot Fixture] verify Guided PR",
        state: "Active",
        tags: ["MergePilot Fixture"],
        relations: [],
        linkedPullRequests: [],
        linkedBuilds: [],
        testEvidence: [],
        comments: [],
      },
    },
    policies: {
      status: "available",
      targetRef: "refs/heads/main",
      configurations: [
        {
          id: 21,
          revision: 3,
          typeId: "minimum-reviewer-count",
          displayName: "Minimum reviewers",
          isEnabled: true,
          isBlocking: true,
        },
        {
          id: 22,
          revision: 1,
          typeId: "comment-requirements",
          displayName: "Comment requirements",
          isEnabled: true,
          isBlocking: false,
        },
      ],
    },
    suggestion: {
      sourceBranch,
      targetBranch: "main",
      title: "[MergePilot Fixture] verify Guided PR",
      description: "Links Work Item #8123 to the exact fixture source revision.",
      draft: false,
      workItemId: 8123,
      reviewerFocus: ["Confirm the fixture branch and linked Work Item."],
      risks: ["The target branch requires at least one reviewer."],
      missingEvidence: validationPassed ? [] : ["Run validation for the current source SHA."],
      readiness: validationPassed ? "ready" : "needs_attention",
    },
  };
}

interface GuidedPrMockState {
  preparationRequests: Array<Record<string, unknown>>;
  validationRequests: Array<Record<string, unknown>>;
  actionProposals: Array<Record<string, unknown>>;
  approvals: number;
  rejections: number;
}

async function mockGuidedPrRuntime(page: Page): Promise<GuidedPrMockState> {
  const state: GuidedPrMockState = {
    preparationRequests: [],
    validationRequests: [],
    actionProposals: [],
    approvals: 0,
    rejections: 0,
  };
  let validationPassed = false;
  let actionPayload: Record<string, unknown> = {};

  await page.route("http://127.0.0.1:8787/healthz", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, llmConfigured: true, cloudProjectLinkStore: false }),
    });
  });
  await page.route("http://127.0.0.1:8787/project-links", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([profile]) });
  });
  await page.route("http://127.0.0.1:8787/chat/history", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("http://127.0.0.1:8787/chat/index-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ indexed: false, semanticReady: false, retrievalMode: "quick-scan" }),
    });
  });
  await page.route("http://127.0.0.1:8787/delivery/pull-request-preparation", async (route) => {
    state.preparationRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(preparation(validationPassed)),
    });
  });
  await page.route("http://127.0.0.1:8787/delivery/pull-request-validation", async (route) => {
    state.validationRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    validationPassed = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectLinkId: profile.id,
        repoPath: profile.repoPath,
        ...preparation(true).validation,
        completedAt: 1_786_000_001_842,
      }),
    });
  });
  await page.route("http://127.0.0.1:8787/delivery/actions", async (route) => {
    actionPayload = route.request().postDataJSON() as Record<string, unknown>;
    state.actionProposals.push(actionPayload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "guided-pr-action-1",
        status: "awaiting_approval",
        kind: actionPayload.kind,
        target: actionPayload.target,
        payload: actionPayload.payload,
      }),
    });
  });
  await page.route("http://127.0.0.1:8787/delivery/actions/guided-pr-action-1/approve", async (route) => {
    state.approvals += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "guided-pr-action-1",
        status: "verified",
        kind: actionPayload.kind,
        target: { ...(actionPayload.target as object), id: 901 },
        payload: actionPayload.payload,
        verificationEvidence: [
          "Azure DevOps re-read pull request #901.",
          "Verified linked Work Item #8123.",
        ],
      }),
    });
  });
  await page.route("http://127.0.0.1:8787/delivery/actions/guided-pr-action-1/reject", async (route) => {
    state.rejections += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "guided-pr-action-1",
        status: "rejected",
        kind: actionPayload.kind,
        target: actionPayload.target,
        payload: actionPayload.payload,
      }),
    });
  });

  return state;
}

test.describe("Guided PR Preparation", () => {
  test("@smoke @mocked binds editable copy to exact evidence and verifies the approved write", async ({ page }) => {
    test.setTimeout(240_000);
    const state = await mockGuidedPrRuntime(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#/pulls/new");

    await expect(page.getByRole("heading", { name: "Guided PR Preparation" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Project Link: ClaimBot_API fixture")).toBeVisible();
    await page.getByRole("button", { name: "Read evidence and prepare" }).click();

    await expect(page.getByRole("heading", { name: "Read-only evidence" })).toBeVisible();
    await expect(page.getByText(`${sourceBranch} @ aaaaaaaa`)).toBeVisible();
    await expect(page.getByText("#8123 · Active · rev 7")).toBeVisible();
    await expect(page.getByText("2 enabled · 1 blocking")).toBeVisible();
    await expect(page.getByText("Validation has not run for the current source SHA.")).toBeVisible();
    expect(state.preparationRequests[0]).toEqual({ projectLinkId: profile.id });

    await page.getByRole("button", { name: "Run current-SHA validation" }).click();
    await expect(page.getByText("Current source SHA validation passed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Re-run current-SHA validation" })).toBeVisible();
    expect(state.validationRequests).toEqual([{ projectLinkId: profile.id, expectedHeadSha: headSha }]);

    const title = page.getByLabel("Title");
    const description = page.getByLabel("Description");
    await title.fill("[MergePilot Fixture] reviewed Guided PR");
    await description.fill("Edited after reading exact branch, Work Item revision, validation, and ADO policies.");
    const preview = page.getByRole("button", { name: "Create approval preview" });
    await expect(preview).toBeEnabled();
    await preview.click();

    await expect(page.getByRole("heading", { name: "Typed ActionRecord preview" })).toBeVisible();
    await expect(page.getByText("Status: awaiting_approval.")).toBeVisible();
    expect(state.actionProposals).toHaveLength(1);
    expect(state.actionProposals[0]).toMatchObject({
      projectLinkId: profile.id,
      kind: "pull_request.create",
      target: {
        kind: "pull_request",
        repositoryId: "claimbot-repository-guid",
        sourceCommit: headSha,
      },
      basedOn: [
        { kind: "branch", name: sourceBranch, objectId: headSha },
        { kind: "branch", name: "main", objectId: targetSha },
        { kind: "work_item", id: 8123, revision: 7 },
      ],
      payload: {
        sourceBranch,
        targetBranch: "main",
        title: "[MergePilot Fixture] reviewed Guided PR",
        description: "Edited after reading exact branch, Work Item revision, validation, and ADO policies.",
        workItemId: 8123,
      },
      expectedResult: [
        { condition: "exists" },
        { condition: "field_contains", field: "workItemIds", expected: ["8123"] },
      ],
    });
    expect(state.approvals).toBe(0);

    await page.getByRole("button", { name: "Approve and create PR" }).click();
    await expect(page.getByText("Pull request verified")).toBeVisible();
    await expect(page.getByText("Azure DevOps returned the created PR and the post-write verification predicates passed.")).toBeVisible();
    expect(state.approvals).toBe(1);
  });

  test("@mocked invalidates stale identity evidence and supports explicit rejection", async ({ page }) => {
    test.setTimeout(240_000);
    const state = await mockGuidedPrRuntime(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#/pulls/new");

    await expect(page.getByRole("heading", { name: "Guided PR Preparation" })).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Read evidence and prepare" }).click();
    const preview = page.getByRole("button", { name: "Create approval preview" });
    await expect(preview).toBeEnabled();

    await page.getByLabel("Source branch").fill("mergepilot-e2e/other-branch");
    await expect(page.getByText("Evidence changed")).toBeVisible();
    await expect(preview).toBeDisabled();
    await page.getByLabel("Source branch").fill(sourceBranch);
    await expect(preview).toBeEnabled();

    await page.getByLabel("Work Item ID").fill("9999");
    await expect(preview).toBeDisabled();
    await page.getByLabel("Work Item ID").fill("8123");
    await expect(preview).toBeEnabled();

    await preview.click();
    expect(state.actionProposals).toHaveLength(1);
    expect(state.rejections).toBe(0);
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("Status: rejected.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and create PR" })).not.toBeVisible();
    expect(state.rejections).toBe(1);
    expect(state.approvals).toBe(0);
  });
});
