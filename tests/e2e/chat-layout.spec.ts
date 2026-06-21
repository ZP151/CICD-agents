import { readFile, writeFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";

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
        stats: {
          filesIndexed: 12,
          chunksIndexed: 32,
          chunksEmbedded: 32,
          chunksPendingEmbedding: 0,
        },
        summary: "Ready",
      }),
    });
  });

  await page.route(
    /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/pr-insights\/artifact\?.*/,
    async (route) => {
      const url = new URL(route.request().url());
      const artifactId = url.searchParams.get("artifactId") ?? "";
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          record: {
            id: artifactId,
            projectLinkId: profile.id,
            repository: profile.adoRepoName,
            pullRequestId: 42,
            title: "Saved PR insight review",
            kind: "review_run",
            at: "2026-06-13T07:30:00.000Z",
            summary: "Persisted review says the PR needs one human check before merge.",
            readiness: "needs_attention",
            decisionQueue: "needs_human_review",
            decisionRiskLevel: "medium",
            contextConfidence: "high",
            risks: ["Policy status should be checked before merge."],
            signals: {
              fileCount: 3,
              threadCount: 1,
              failedBuildCount: 1,
              failedPolicyCount: 1,
              workItemCount: 0,
              buildBlockers: [
                {
                  id: 77,
                  buildNumber: "20260610.1",
                  definitionName: "CI",
                  status: "completed",
                  result: "failed",
                  url: "https://ado/build/77",
                },
              ],
              policyBlockers: [
                {
                  id: "policy-1",
                  name: "Minimum reviewers",
                  typeName: "Reviewer policy",
                  status: "failed",
                  isBlocking: true,
                },
              ],
              activeThreads: [
                {
                  id: 5,
                  status: 1,
                  author: "Ada",
                  firstComment: "Needs tests",
                },
              ],
              linkedWorkItems: [],
            },
            findingCount: 1,
            discardedFindingCount: 0,
            tokensIn: 1200,
            tokensOut: 340,
          },
        }),
      });
    },
  );

  await page.addInitScript((seedProfile) => {
    localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([seedProfile]));
    localStorage.setItem("mergepilot_active_project_link_id", seedProfile.id);
    localStorage.setItem("chat_repo", seedProfile.repoPath);
    localStorage.setItem("mergepilot_active_model", "built_in");
  }, profile);
}

async function expectNoVisibleHorizontalOverflow(page: Page): Promise<void> {
  let overflow: Array<{
    tag: string;
    text: string;
    left: number;
    right: number;
    width: number;
    className: string;
  }> = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      overflow = await page.evaluate(() => {
        function visible(el: Element): boolean {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          let node: Element | null = el;
          while (node) {
            const style = window.getComputedStyle(node);
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number(style.opacity) <= 0.05
            ) {
              return false;
            }
            node = node.parentElement;
          }
          return true;
        }

        return Array.from(document.querySelectorAll("*"))
          .filter(visible)
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              className: typeof el.className === "string" ? el.className.slice(0, 100) : "",
            };
          })
          .filter((item) => item.left < -2 || item.right > window.innerWidth + 2)
          .slice(0, 10);
      });
      break;
    } catch (error) {
      if (
        attempt === 1 ||
        !(error instanceof Error) ||
        !/Execution context was destroyed/i.test(error.message)
      ) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded");
    }
  }

  expect(overflow).toEqual([]);
}

async function expectNoHorizontalOverlap(left: Locator, right: Locator): Promise<void> {
  const [leftBox, rightBox] = await Promise.all([
    left.boundingBox(),
    right.boundingBox(),
  ]);
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect((leftBox?.x ?? 0) + (leftBox?.width ?? 0)).toBeLessThanOrEqual((rightBox?.x ?? 0) + 1);
}

async function expectRightShellSplitStartsAtTop(page: Page): Promise<void> {
  await expect.poll(async () => {
    const [handleBox, messagePanelBox] = await Promise.all([
      page.getByTestId("right-shell-resize-handle").boundingBox(),
      page.getByTestId("chat-message-panel").boundingBox(),
    ]);
    if (!handleBox || !messagePanelBox) return Number.POSITIVE_INFINITY;
    return handleBox.y <= 2 && handleBox.y < messagePanelBox.y ? 0 : Number.POSITIVE_INFINITY;
  }).toBe(0);
}

async function expectSummaryToggleNearRightSplit(page: Page): Promise<void> {
  await expect.poll(async () => {
    const [handleBox, summaryBox] = await Promise.all([
      page.getByTestId("right-shell-resize-handle").boundingBox(),
      page.getByLabel(/pinned summary/i).boundingBox(),
    ]);
    if (!handleBox || !summaryBox) return Number.POSITIVE_INFINITY;
    const gap = handleBox.x - (summaryBox.x + summaryBox.width);
    return gap >= 0 ? gap : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(18);
  const [handleBox, summaryBox] = await Promise.all([
    page.getByTestId("right-shell-resize-handle").boundingBox(),
    page.getByLabel(/pinned summary/i).boundingBox(),
  ]);
  expect((summaryBox?.x ?? 0) + (summaryBox?.width ?? 0)).toBeLessThanOrEqual((handleBox?.x ?? 0) + 1);
}

function sse(events: Array<{ event: string; data: unknown }>): string {
  return events
    .map((entry) => `event: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`)
    .join("");
}

async function seedLongWorkflowTranscriptDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-review-stage",
            kind: "user",
            text: "Review my changes and stage the safe files",
          },
          {
            id: "tool-status-long",
            kind: "tool",
            toolName: "git_status",
            toolArgs: { command: "git status --short -b" },
            toolOk: true,
            toolSummary: "2 modified",
            toolResult: {
              stdout: "## feature/review...origin/feature/review\n M src/app.ts\n M src/api.ts",
              returncode: 0,
            },
          },
          {
            id: "tool-diff-long",
            kind: "tool",
            toolName: "git_diff",
            toolArgs: { command: "git diff -- src/app.ts src/api.ts" },
            toolOk: true,
            toolSummary: "diff inspected",
            toolResult: {
              stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const reviewed = true;",
              returncode: 0,
            },
          },
          {
            id: "tool-add-long",
            kind: "tool",
            toolName: "git_add",
            toolArgs: { paths: ["src/app.ts", "src/api.ts"] },
            toolOk: true,
            toolSummary: "ready to stage selected files",
            toolResult: { stdout: "", returncode: 0 },
          },
          {
            id: "assistant-review-stage",
            kind: "assistant",
            text: "The diff is focused on local API wiring and app state. No generated files or broad formatting churn were detected.",
          },
          {
            id: "pending-stage-long",
            kind: "pending_confirm",
            pendingTool: "git_add",
            pendingArgs: { paths: ["src/app.ts", "src/api.ts"] },
            pendingDescription: "Stage selected files for commit",
            pendingStatus: "waiting",
            riskLevel: "medium",
          },
        ],
        sessionId: "long-workflow-transcript-session",
        statusText: null,
        workflowState: {
          status: "waiting_for_approval",
          currentStep: "Stage selected files",
          workflowKind: "git",
          workflowPhase: "stage",
          completedTools: ["git_status", "git_diff"],
        },
        customTitle: "Long workflow transcript",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedPendingApprovalDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "try to start another request",
        bubbles: [
          {
            id: "tool-status",
            kind: "tool",
            toolName: "git_status",
            toolOk: true,
            toolSummary: "found local changes",
            toolResult: { stdout: "## main\n M apps/desktop/src/pages/Chat.tsx", returncode: 0 },
          },
          {
            id: "tool-add",
            kind: "tool",
            toolName: "git_add",
            toolOk: true,
            toolArgs: { paths: ["apps/desktop/src/pages/Chat.tsx"] },
            toolSummary: "ready to stage selected files",
            toolResult: { stdout: "", returncode: 0 },
          },
          {
            id: "pending-approval",
            kind: "pending_confirm",
            text: "",
            pendingTool: "git_add",
            pendingArgs: { paths: ["apps/desktop/src/pages/Chat.tsx"] },
            pendingDescription: "Stage selected files for commit",
            pendingNextHint: "Continue to commit after staging",
            pendingStatus: "waiting",
          },
        ],
        sessionId: "pw-session",
        statusText: null,
        workflowState: null,
        customTitle: null,
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedRunningWorkflowDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-review",
            kind: "user",
            text: "Review my changes",
          },
          {
            id: "assistant-review",
            kind: "assistant",
            text: "git_status found modified files and git_diff inspected the diff.",
          },
        ],
        sessionId: "running-session",
        statusText: "Inspecting workspace",
        workflowState: {
          status: "running",
          currentStep: "Inspecting workspace",
          workflowKind: "git",
          workflowPhase: "inspect_changes",
          completedTools: ["git_status"],
        },
        customTitle: null,
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedFetchedGitWorkflowDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-fetch",
            kind: "user",
            text: "Fetch remotes",
          },
          {
            id: "tool-fetch",
            kind: "tool",
            toolName: "git_fetch",
            toolArgs: { remote: "origin", prune: true },
            toolOk: true,
            toolSummary: "fetched origin",
            toolResult: { stdout: "", stderr: "", returncode: 0 },
          },
          {
            id: "assistant-fetch",
            kind: "assistant",
            text: "Fetched latest refs from origin. Refresh branch status next, then decide whether to rebase or push.",
            meta: {
              suggestions: ["Refresh branch status", "Pull/rebase first", "Push branch"],
            },
          },
        ],
        sessionId: "fetched-git-session",
        statusText: null,
        workflowState: {
          status: "done",
          currentStep: "Fetched origin",
          workflowKind: "git",
          workflowPhase: "fetched",
          completedTools: ["git_fetch"],
        },
        customTitle: "Fetched remotes",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedReviewedChangesDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-review-follow-up",
            kind: "user",
            text: "Review my changes",
          },
          {
            id: "assistant-review-follow-up",
            kind: "assistant",
            text: "git_status found modified files and git_diff inspected the diff. The changes are narrow and ready for a scoped follow-up.",
          },
        ],
        sessionId: "reviewed-changes-follow-up-session",
        statusText: null,
        workflowState: null,
        customTitle: "Reviewed changes",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedCommitReadyDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-commit-ready",
            kind: "user",
            text: "Commit the staged changes",
          },
          {
            id: "assistant-commit-ready",
            kind: "assistant",
            text: "The files are staged and ready for a commit message.",
          },
        ],
        sessionId: "commit-ready-follow-up-session",
        statusText: null,
        workflowState: {
          status: "done",
          currentStep: "Staged files ready",
          workflowKind: "commit",
          workflowPhase: "commit",
          completedTools: ["git_status", "git_diff", "git_add"],
        },
        customTitle: "Commit ready",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedPushReadyDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-push-ready",
            kind: "user",
            text: "Push this branch",
          },
          {
            id: "assistant-push-ready",
            kind: "assistant",
            text: "The commit is ready to push after checking the remote target.",
          },
        ],
        sessionId: "push-ready-follow-up-session",
        statusText: null,
        workflowState: {
          status: "waiting_for_approval",
          currentStep: "Push branch",
          workflowKind: "commit",
          workflowPhase: "waiting_for_push_approval",
          completedTools: ["git_status", "git_upstream"],
        },
        customTitle: "Push ready",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedPushedCommitDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-pushed-commit",
            kind: "user",
            text: "Stage, commit and push",
          },
          {
            id: "assistant-pushed-commit",
            kind: "assistant",
            text: "The committed changes have been pushed. I stopped here because the requested scope was stage, commit, and push.",
          },
        ],
        sessionId: "pushed-commit-follow-up-session",
        statusText: null,
        workflowState: {
          status: "done",
          currentStep: "Push complete",
          workflowKind: "commit",
          workflowPhase: "pushed",
          completedTools: ["git_add", "git_commit", "git_push"],
        },
        customTitle: "Pushed commit",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedValidationFailureDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-validation-failure",
            kind: "user",
            text: "Run tests",
          },
          {
            id: "assistant-validation-failure",
            kind: "assistant",
            text: "Tests failed. Key output: FAIL src/app.test.ts",
            artifacts: [
              {
                type: "artifact",
                artifactId: "validation-test-failed-e2e",
                title: "Test failure report",
                artifactType: "markdown",
                status: "error",
                content: [
                  "# Test Failure Report",
                  "",
                  "## Recovery Signals",
                  "- Framework: vitest",
                  "- Failing files: `src/app.test.ts`",
                  "- Candidate rerun: `npm test -- src/app.test.ts`",
                  "",
                  "AssertionError: expected true to be false",
                ].join("\n"),
              },
            ],
          },
        ],
        sessionId: "validation-failure-follow-up-session",
        statusText: null,
        workflowState: {
          status: "done",
          currentStep: "Test validation failed",
          workflowKind: "ci",
          workflowPhase: "test_failed",
          completedTools: ["validation_command"],
        },
        customTitle: "Validation failed",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedRunningPrReadinessWorkflowDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-pr",
            kind: "user",
            text: "Analyze PR readiness",
          },
          {
            id: "assistant-pr",
            kind: "assistant",
            text: "Readiness: blocked. 4 changed file(s), 1 active thread(s), 1 failed/canceled build(s), 2 failed/error policy evaluation(s), 0 linked work item(s).",
          },
        ],
        sessionId: "running-pr-readiness-session",
        statusText: "Inspecting PR readiness blockers",
        workflowState: {
          status: "running",
          currentStep: "Inspecting PR readiness blockers",
          workflowKind: "pr",
          workflowPhase: "inspected",
          workflowSummary:
            "Readiness: blocked. 4 changed file(s), 1 active thread(s), 1 failed/canceled build(s), 2 failed/error policy evaluation(s), 0 linked work item(s).",
          completedTools: ["ado_get_pull_request_by_id"],
        },
        customTitle: "PR readiness",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedPrCiRecoveryDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-pr-ci-recovery",
            kind: "user",
            text: "Analyze PR readiness",
          },
          {
            id: "assistant-pr-ci-recovery",
            kind: "assistant",
            text: "PR readiness is blocked by failed CI validation and a required policy.",
          },
        ],
        sessionId: "pr-ci-recovery-follow-up-session",
        statusText: null,
        workflowState: {
          status: "done",
          currentStep: "PR readiness inspected",
          workflowKind: "pr",
          workflowPhase: "inspected",
          completedTools: ["ado_get_pull_request_by_id"],
        },
        customTitle: "PR CI recovery",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedInterruptedStreamingDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-long-answer",
            kind: "user",
            text: "Write a long project explanation",
          },
          {
            id: "assistant-interrupted-stream",
            kind: "assistant",
            text: "",
            parts: [
              {
                type: "markdown",
                markdown: "Partial architecture answer before the page was reloaded.",
              },
            ],
            streaming: true,
          },
        ],
        sessionId: "interrupted-stream-session",
        statusText: "Thinking",
        workflowState: null,
        customTitle: "Interrupted stream",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedLongHistoryDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    const bubbles = Array.from({ length: 36 }, (_, index) => ({
      id: `history-${index + 1}`,
      kind: index % 2 === 0 ? "user" : "assistant",
      text: `History item ${index + 1}\n${"Repository context and review notes. ".repeat(6)}`,
    }));
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles,
        sessionId: "long-history-session",
        statusText: null,
        workflowState: null,
        customTitle: "Long history",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedArtifactDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "assistant-artifact",
            kind: "assistant",
            parts: [
              {
                type: "markdown",
                markdown: "I prepared an architecture diagram artifact.",
              },
              {
                type: "artifact",
                artifactId: "artifact-architecture",
                title: "Project architecture diagram",
                artifactType: "mermaid",
                status: "ready",
                content:
                  "flowchart TD\n  UI[Desktop chat] --> Agent[MergePilot]\n  Agent --> ADO[Azure DevOps]",
              },
              {
                type: "artifact",
                artifactId: "artifact-report",
                title: "PR insight report",
                artifactType: "markdown",
                status: "ready",
                content: "## PR insight\n\n- Risk: medium\n- Decision: review before merge",
              },
              {
                type: "artifact",
                artifactId: "artifact-notes",
                title: "Review notes",
                artifactType: "text",
                status: "ready",
                content: "File changes look focused.\nNo blocking issue found.",
              },
            ],
          },
        ],
        sessionId: "artifact-session",
        statusText: null,
        workflowState: null,
        customTitle: "Architecture artifact",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedSavedPrInsightSourceDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "assistant-saved-source",
            kind: "assistant",
            text: "I used a saved PR insight artifact for this answer.",
            meta: {
              suggestions: [
                "Used saved PR AI insight artifact pw-profile/CICD-agents/42/review_run/2026-06-13T07%3A30%3A00.000Z for PR #42 (review_run, 2026-06-13T07:30:00.000Z).",
                "Build blockers: #77 20260610.1 CI: failed",
                "Policy blockers: Minimum reviewers: failed (blocking)",
                "workItems=0",
              ],
            },
          },
        ],
        sessionId: "saved-source-session",
        statusText: null,
        workflowState: {
          status: "done",
          workflowKind: "pr",
          workflowPhase: "inspected",
          currentStep: "Saved PR insight loaded",
          completedTools: ["ado_get_pull_request_by_id"],
        },
        customTitle: "Saved PR source",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedUnbackedArtifactDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "assistant-unbacked-artifact",
            kind: "assistant",
            parts: [
              {
                type: "artifact",
                artifactId: "artifact-unbacked-report",
                title: "Unbacked report shell",
                artifactType: "markdown",
                status: "ready",
              },
            ],
          },
        ],
        sessionId: "unbacked-artifact-session",
        statusText: null,
        workflowState: null,
        customTitle: "Unbacked artifact",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedInvalidMermaidArtifactDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "assistant-invalid-mermaid",
            kind: "assistant",
            parts: [
              {
                type: "artifact",
                artifactId: "artifact-invalid-mermaid",
                title: "Broken Mermaid diagram",
                artifactType: "mermaid",
                status: "ready",
                content: "flowchart TD\n  A -->",
              },
            ],
          },
        ],
        sessionId: "invalid-mermaid-session",
        statusText: null,
        workflowState: null,
        customTitle: "Broken diagram",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function seedSourceReferenceDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem(
      "dev_agent_chat_draft_v1",
      JSON.stringify({
        repoPath: seedProfile.repoPath,
        input: "",
        bubbles: [
          {
            id: "user-architecture",
            kind: "user",
            text: "Explain this project architecture",
          },
          {
            id: "assistant-architecture",
            kind: "assistant",
            text: "The Conversation page coordinates the desktop UI while chatContext builds repository grounding for project-specific answers.",
            meta: {
              riskLevel: "low",
              actionsTaken: ["repo_refresh_index"],
              sources: [
                {
                  type: "source_document",
                  sourceId: "structure-chat",
                  title: "apps/desktop/src/pages/Chat.tsx (app)",
                  file: "apps/desktop/src/pages/Chat.tsx",
                  snippet: "Project structure signal: application workspace.",
                },
                {
                  type: "source_document",
                  sourceId: "context-chat",
                  title: "packages/core/src/chatContext.ts:291-350",
                  file: "packages/core/src/chatContext.ts",
                  line: 291,
                  snippet:
                    "chatContextSources emits source_document metadata for repository context.",
                },
              ],
            },
          },
        ],
        sessionId: "source-reference-session",
        statusText: null,
        workflowState: null,
        customTitle: "Architecture references",
        activeProfileId: seedProfile.id,
      }),
    );
  }, profile);
}

async function mockWorkspaceFilePreview(page: Page): Promise<void> {
  await page.route("http://127.0.0.1:8787/workspace/file", async (route) => {
    const payload = await route.request().postDataJSON() as { filePath?: string };
    const content = Array.from(
      { length: 300 },
      (_, index) => `export const previewLine${index + 1} = ${index + 1};`,
    ).join("\n");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repoPath: profile.repoPath,
        path: payload.filePath ?? "apps/desktop/src/pages/Chat.tsx",
        content,
        size: content.length,
        lineCount: 300,
      }),
    });
  });
}

test.describe("Chat layout", () => {
  test.beforeEach(async ({ page }) => {
    await mockRuntime(page);
  });

  test("keeps the project-linked chat shell inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await expect(page.getByText(/Ask (MergePilot|MergePilot) anything/)).toBeVisible();
    await expect(page.getByTitle("Conversation model")).toContainText("GPT-4o");
    await expectNoVisibleHorizontalOverflow(page);

    const expandContextPanel = page.getByTitle("Expand context panel");
    if (await expandContextPanel.count()) await expandContextPanel.click();
    await expect(page.getByText("Environment")).toBeVisible();
    await expect(page.getByText("Commit or push")).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);

    await page.getByTitle("Conversation model").click();
    await expect(page.getByText("Model", { exact: true })).toBeVisible();
    await expect(page.getByText("GPT-4o").last()).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps the onboarding form and input usable on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 836, height: 768 });
    await page.goto("/chat?new=1");

    await expect(page.getByText(/Ask (MergePilot|MergePilot) anything/)).toBeVisible();
    await expect(page.getByPlaceholder(/Ask (MergePilot|MergePilot)/)).toBeVisible();
    await page.getByTitle("Conversation model").click();
    await expect(page.getByText("Model", { exact: true })).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps command chips compact and routes structured validation commands", async ({
    page,
  }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Validation approval prepared",
          workflowState: {
            status: "waiting_for_approval",
            workflowKind: "ci",
            workflowPhase: "waiting_for_test_approval",
            currentStep: "Run test validation",
            completedTools: [],
            pendingApproval: {
              id: "approval_validation",
              riskLevel: "medium",
              explanation: "Run test validation",
              action: {
                tool: "validation_command",
                args: { command: "npm test", kind: "test" },
                description: "Run test validation: npm test",
                workflow: { kind: "ci", phase: "test", message: "npm test" },
              },
            },
          },
          tools: [],
        }),
      });
    });
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat?new=1");

    await expect(page.getByRole("button", { name: "Review changes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Explain architecture" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run tests" })).toBeVisible();
    await expect(
      page.getByTitle("Inspect pull request insight for the active Azure DevOps context."),
    ).toBeVisible();
    await expect(
      page.getByTitle("Inspect Azure DevOps pipeline readiness for this project link."),
    ).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);

    await page.getByRole("button", { name: "Run tests" }).click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "run_tests" });
    await expect(page.getByPlaceholder(/Approve or cancel/)).toHaveValue("");
    await expect(page.getByText("Run test validation: npm test")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review changes" })).toBeDisabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes right-panel commit controls as explicit structured actions", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: `${payload.action} complete`,
          workflowState: {
            status: "done",
            currentStep: `${payload.action} complete`,
            completedTools: [],
          },
          tools: [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await expect(page.getByText("Environment")).toBeVisible();

    await page.getByRole("button", { name: "Commit or push" }).click();
    await page.getByRole("button", { name: "Prepare commit", exact: true }).click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({
      action: "prepare_commit",
      branch: "main",
      includeUnstaged: true,
      commitMode: "commit",
    });

    await page.getByRole("button", { name: "Commit or push" }).click();
    await page.getByRole("button", { name: "Prepare commit and push" }).click();
    await expect.poll(() => workflowPayloads.length).toBe(2);
    expect(workflowPayloads[1]).toMatchObject({
      action: "prepare_commit",
      branch: "main",
      includeUnstaged: true,
      commitMode: "commit-push",
    });

    await page.getByRole("button", { name: "Commit or push" }).click();
    await page.getByRole("button", { name: "Push branch" }).click();
    await expect.poll(() => workflowPayloads.length).toBe(3);
    expect(workflowPayloads[2]).toMatchObject({
      action: "push_branch",
      branch: "main",
    });
    expect(workflowPayloads[2]).not.toHaveProperty("commitMode");
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows branch divergence before commit or push actions", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = await route.request().postDataJSON();
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "sync proposal",
          workflowState: {
            status: "waiting_for_approval",
            currentStep: "Pull latest changes from origin/main with rebase before pushing.",
            completedTools: ["git_current_branch", "git_status", "git_dir", "git_remote", "git_upstream", "git_divergence"],
            pendingApproval: {
              id: "approval-sync",
              action: {
                tool: "git_pull",
                args: { remote: "origin", branch: "main", rebase: true },
                description: "Pull latest changes from origin/main with rebase before pushing.",
              },
              riskLevel: "high",
              explanation: "Pull latest changes from origin/main with rebase before pushing.",
            },
          },
          tools: [],
        }),
      });
    });
    await page.addInitScript((seedProfile) => {
      sessionStorage.setItem(
        "dev_agent_chat_draft_v1",
        JSON.stringify({
          repoPath: seedProfile.repoPath,
          input: "",
          bubbles: [
            {
              id: "tool-diverged-status",
              kind: "tool",
              toolName: "git_status",
              toolOk: true,
              toolResult: {
                stdout: "## main...origin/main [ahead 1, behind 2]\n M src/app.ts",
                returncode: 0,
              },
            },
          ],
          sessionId: "branch-divergence-session",
          statusText: null,
          workflowState: null,
          customTitle: "Branch divergence",
          activeProfileId: seedProfile.id,
        }),
      );
    }, profile);

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");
    const collapseCodePanel = page.getByTitle("Collapse code panel");
    if (await collapseCodePanel.count()) await collapseCodePanel.click();

    await expect(page.getByText("Environment")).toBeVisible();
    await page.getByRole("button", { name: "Commit or push" }).click();
    await expect(page.getByText("Diverged: 1 ahead, 2 behind")).toBeVisible();
    await expect(page.getByText("Include unstaged changes")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pull with rebase before pushing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare commit", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Prepare commit and push" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Push branch" })).toBeDisabled();
    await page.getByRole("button", { name: "Pull with rebase before pushing" }).click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({
      action: "sync_branch_rebase",
      branch: "main",
    });
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("refreshes branch readiness from the synced progress follow-up", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = await route.request().postDataJSON();
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Branch: main\nGit status: 1 line(s)",
          workflowState: {
            status: "done",
            currentStep: "refresh_branch complete",
            completedTools: ["git_current_branch", "git_branch_list", "git_status", "git_remote", "git_upstream", "git_divergence"],
          },
          tools: [
            { name: "git_current_branch", command: "git branch --show-current", ok: true, stdout: "main\n", stderr: "", returncode: 0 },
            { name: "git_branch_list", command: "git branch -a", ok: true, stdout: "* main\n", stderr: "", returncode: 0 },
            { name: "git_status", command: "git status --porcelain=v1 -b", ok: true, stdout: "## main...origin/main\n", stderr: "", returncode: 0 },
            { name: "git_remote", command: "git remote -v", ok: true, stdout: "origin https://example.test/repo.git (fetch)\norigin https://example.test/repo.git (push)\n", stderr: "", returncode: 0 },
            { name: "git_upstream", command: "git rev-parse --abbrev-ref --symbolic-full-name @{u}", ok: true, stdout: "origin/main\n", stderr: "", returncode: 0 },
            { name: "git_divergence", command: "git rev-list --left-right --count origin/main...HEAD", ok: true, stdout: "0\t0\n", stderr: "", returncode: 0 },
          ],
        }),
      });
    });
    await page.addInitScript((seedProfile) => {
      sessionStorage.setItem(
        "dev_agent_chat_draft_v1",
        JSON.stringify({
          repoPath: seedProfile.repoPath,
          input: "",
          bubbles: [
            {
              id: "tool-old-diverged-status",
              kind: "tool",
              toolName: "git_status",
              toolOk: true,
              toolResult: {
                stdout: "## main...origin/main [ahead 1, behind 2]\n",
                returncode: 0,
              },
            },
          ],
          sessionId: "branch-synced-session",
          statusText: null,
          workflowState: {
            status: "done",
            currentStep: "Synced branch main",
            completedTools: ["git_current_branch", "git_status", "git_dir", "git_remote", "git_upstream", "git_divergence", "git_pull"],
            workflowKind: "git",
            workflowPhase: "synced",
          },
          customTitle: "Branch synced",
          activeProfileId: seedProfile.id,
        }),
      );
    }, profile);

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");
    const collapseCodePanel = page.getByTitle("Collapse code panel");
    if (await collapseCodePanel.count()) await collapseCodePanel.click();

    await page.getByRole("button", { name: "Progress" }).click();
    await expect(page.getByRole("button", { name: /Refresh branch status/ })).toBeVisible();
    await page.getByRole("button", { name: /Refresh branch status/ }).click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({
      action: "refresh_branch",
    });

    await page.getByRole("button", { name: "Commit or push" }).click();
    await expect(page.getByText("Diverged: 1 ahead, 2 behind")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prepare commit and push" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Push branch" })).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps pinned summary branch and commit dropdowns mutually exclusive", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      workflowPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: "fetch_remotes",
          repoPath: profile.repoPath,
          summary: "Branch: main",
          workflowState: {
            status: "waiting_for_approval",
            currentStep: "Fetch latest remote refs from origin.",
            completedTools: ["git_current_branch", "git_status", "git_dir", "git_remote"],
            workflowKind: "git",
            workflowPhase: "waiting_for_fetch_remotes_approval",
            pendingApproval: {
              id: "approval-fetch",
              riskLevel: "medium",
              explanation: "Fetch latest remote refs from origin.",
              action: {
                tool: "git_fetch",
                args: { remote: "origin", prune: true },
                description: "Fetch latest remote refs from origin.",
                workflow: { kind: "git", phase: "fetch_remotes", branch: "main" },
              },
            },
          },
          tools: [],
        }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    const collapseCodePanel = page.getByTitle("Collapse code panel");
    if (await collapseCodePanel.count()) await collapseCodePanel.click();
    await expect(page.getByText("Environment")).toBeVisible();

    await page.getByRole("button", { name: "main" }).click();
    await expect(page.getByText("Refresh branch state")).toBeVisible();
    await expect(page.getByText("Fetch remotes")).toBeVisible();
    await page.getByText("Fetch remotes").click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "fetch_remotes" });

    await page.getByRole("button", { name: "main" }).click();
    await page.getByRole("button", { name: "Commit or push" }).click();
    await expect(page.getByText("Refresh branch state")).toBeHidden();
    await expect(page.getByText("Include unstaged changes")).toBeVisible();

    await page.getByTitle("Project Link").click();
    await expect(page.getByText("Include unstaged changes")).toBeHidden();
  });

  test("keeps the pinned summary hidden during empty Project Link onboarding", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([]));
      localStorage.removeItem("mergepilot_active_project_link_id");
      localStorage.removeItem("chat_repo");
      sessionStorage.removeItem("dev_agent_chat_draft_v1");
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await expect(page.getByText("Create a Project Link")).toBeVisible();
    await expect(page.getByText("No Project Link yet — create one above")).toBeVisible();
    await expect(page.getByText("Environment")).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("sends image attachments from the compact composer add menu", async ({ page }, testInfo) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "image-attachment-session" } },
          {
            event: "done",
            data: {
              type: "done",
              result: {
                response: "Image received.",
                streamedResponse: "Image received.",
                finalizationMode: "agent_final",
                riskLevel: "low",
                actionsTaken: [],
                suggestions: [],
              },
            },
          },
        ]),
      });
    });

    const imagePath = testInfo.outputPath("composer-screenshot.png");
    await writeFile(
      imagePath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await page.getByTitle("Add image").click();
    await expect(page.getByRole("menuitem", { name: "Image" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Path" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log" })).toHaveCount(0);

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("menuitem", { name: "Image" }).click(),
    ]);
    await fileChooser.setFiles(imagePath);

    await expect(page.getByText("composer-screenshot.png")).toBeVisible();
    await page.getByPlaceholder(/Ask MergePilot/).fill("What is in this screenshot?");
    await page.getByLabel("Send message").click();

    await expect(page.getByRole("img", { name: "composer-screenshot.png" })).toBeVisible();
    await expect(page.getByText("[image: composer-screenshot.png]")).toHaveCount(0);
    await expect(page.getByText("Image received.")).toBeVisible();
    await expect.poll(() => chatPayloads.length).toBe(1);
    expect(chatPayloads[0]).toMatchObject({
      message: "What is in this screenshot?",
      repoPath: profile.repoPath,
      imageAttachments: [
        {
          name: "composer-screenshot.png",
          mimeType: "image/png",
        },
      ],
    });
    expect(
      ((chatPayloads[0]?.["imageAttachments"] as Array<Record<string, unknown>> | undefined)?.[0]?.["dataUrl"] as string | undefined) ?? "",
    ).toMatch(/^data:image\/png;base64,/);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("accepts dropped image attachments in the composer", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "dropped-image-session" } },
          {
            event: "done",
            data: {
              type: "done",
              result: {
                response: "Dropped image received.",
                streamedResponse: "Dropped image received.",
                finalizationMode: "agent_final",
                riskLevel: "low",
                actionsTaken: [],
                suggestions: [],
              },
            },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    const dataTransfer = await page.evaluateHandle(() => {
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
      const bytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
      const file = new File([bytes], "dropped-screenshot.png", { type: "image/png" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      return transfer;
    });

    await page.getByPlaceholder(/Ask MergePilot/).dispatchEvent("drop", { dataTransfer });
    await expect(page.getByText("dropped-screenshot.png")).toBeVisible();
    await page.getByLabel("Send message").click();

    await expect(page.getByRole("img", { name: "dropped-screenshot.png" })).toBeVisible();
    await expect(page.getByText("Dropped image received.")).toBeVisible();
    await expect.poll(() => chatPayloads.length).toBe(1);
    expect(chatPayloads[0]).toMatchObject({
      message: "",
      repoPath: profile.repoPath,
      imageAttachments: [
        {
          name: "dropped-screenshot.png",
          mimeType: "image/png",
        },
      ],
    });
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("accepts pasted image attachments in the composer", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "pasted-image-session" } },
          {
            event: "done",
            data: {
              type: "done",
              result: {
                response: "Pasted image received.",
                streamedResponse: "Pasted image received.",
                finalizationMode: "agent_final",
                riskLevel: "low",
                actionsTaken: [],
                suggestions: [],
              },
            },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).evaluate((textarea) => {
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
      const bytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
      const file = new File([bytes], "pasted-screenshot.png", { type: "image/png" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      textarea.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }));
    });
    await expect(page.getByText("pasted-screenshot.png")).toBeVisible();
    await page.getByLabel("Send message").click();

    await expect(page.getByRole("img", { name: "pasted-screenshot.png" })).toBeVisible();
    await expect(page.getByText("Pasted image received.")).toBeVisible();
    await expect.poll(() => chatPayloads.length).toBe(1);
    expect(chatPayloads[0]).toMatchObject({
      message: "",
      repoPath: profile.repoPath,
      imageAttachments: [
        {
          name: "pasted-screenshot.png",
          mimeType: "image/png",
        },
      ],
    });
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes PR insight controls without requiring a typed PR id", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary:
            payload.action === "inspect_pr_insight"
              ? "Readiness: blocked. 4 changed file(s), 1 active thread(s), 1 failed/canceled build(s), 2 failed/error policy evaluation(s), 0 linked work item(s). Info: no linked work items were found."
              : `${payload.action} complete for latest active PR`,
          workflowState: {
            status: "done",
            workflowKind: "pr",
            workflowPhase:
              payload.action === "check_pr_policy"
                ? "policy_checked"
                : payload.action === "list_pr_work_items"
                  ? "work_items_listed"
                  : "inspected",
            currentStep: `${payload.action} complete`,
            completedTools:
              payload.action === "inspect_pr_insight" ? ["ado_get_pull_request_by_id"] : [],
          },
          tools: [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await page
      .getByTitle("Inspect pull request insight for the active Azure DevOps context.")
      .click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "inspect_pr_insight" });
    expect(workflowPayloads[0]).not.toHaveProperty("pullRequestId");

    await page.getByTitle("Expand context panel").click();
    await expect(page.getByRole("button", { name: "Review CI blockers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check policy blockers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review work items" })).toBeVisible();
    await page.getByRole("button", { name: "Review CI blockers" }).click();
    await expect.poll(() => workflowPayloads.length).toBe(2);
    expect(workflowPayloads[1]).toMatchObject({ action: "run_tests" });

    await page.getByTitle("Check Azure DevOps pull request policy status.").click();
    await expect.poll(() => workflowPayloads.length).toBe(3);
    expect(workflowPayloads[2]).toMatchObject({ action: "check_pr_policy" });
    expect(workflowPayloads[2]).not.toHaveProperty("pullRequestId");

    await page.getByTitle("List linked work items for the latest active pull request").click();
    await expect.poll(() => workflowPayloads.length).toBe(4);
    expect(workflowPayloads[3]).toMatchObject({ action: "list_pr_work_items" });
    expect(workflowPayloads[3]).not.toHaveProperty("pullRequestId");
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes pipeline controls as explicit structured CI workflow actions", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary:
            payload.action === "inspect_pipeline"
              ? "Pipeline #12 latest run #77 20260613.1: completed/failed.\nRecent runs: 1. Failed or canceled: 1."
              : "Trigger Azure Pipeline #12 on main.",
          workflowState:
            payload.action === "inspect_pipeline"
              ? {
                  status: "done",
                  workflowKind: "ci",
                  workflowPhase: "pipeline_inspected",
                  currentStep: "Pipeline #12 readiness inspected",
                  workflowSummary: "Pipeline #12 latest run #77 20260613.1: completed/failed.",
                  completedTools: [
                    "ado_list_pipeline_runs",
                    "ado_get_build_timeline",
                    "ado_get_build_log_excerpt",
                  ],
                }
              : {
                  status: "waiting_for_approval",
                  workflowKind: "ci",
                  workflowPhase: "waiting_for_pipeline_trigger_approval",
                  currentStep: "Trigger Azure Pipeline #12 on main.",
                  completedTools: [],
                  pendingApproval: {
                    id: "approval_pipeline",
                    riskLevel: "high",
                    explanation: "Trigger Azure Pipeline #12 on main.",
                    action: {
                      tool: "ado_trigger_pipeline",
                      args: { pipeline_id: 12, branch: "main" },
                      description: "Trigger Azure Pipeline #12 on main.",
                      workflow: {
                        kind: "ci",
                        phase: "pipeline_trigger",
                        branch: "main",
                        message: "Pipeline #12",
                      },
                    },
                  },
                },
          tools: [],
          artifacts:
            payload.action === "inspect_pipeline"
              ? [
                  {
                    type: "artifact",
                    artifactId: "pipeline-12-run-77-failed",
                    title: "Pipeline #12 run #77 failure",
                    artifactType: "markdown",
                    status: "error",
                    content:
                      "# Pipeline #12 failure\n\n## Log excerpts\n\n```text\nAssertionError: expected true to be false\n```\n\nCandidate next actions:\n\n- Analyze pipeline failure\n- Trigger pipeline rerun",
                  },
                ]
              : [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await page
      .locator(
        'button[data-action-kind="workspace_action"][title="Inspect Azure DevOps pipeline readiness for this project link."]',
      )
      .click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "inspect_pipeline" });
    expect(workflowPayloads[0]).not.toHaveProperty("pullRequestId");
    await expect(page.getByText("Pipeline #12 run #77 failure").first()).toBeVisible();

    await page.getByTitle("Expand context panel").click();
    await expect(page.getByRole("button", { name: "Trigger pipeline" })).toBeVisible();
    await page
      .getByTitle("Prepare approval before triggering the configured Azure DevOps pipeline")
      .click();
    await expect.poll(() => workflowPayloads.length).toBe(2);
    expect(workflowPayloads[1]).toMatchObject({
      action: "trigger_pipeline",
      branch: "main",
    });
    await expect(page.getByText("Trigger Azure Pipeline #12 on main.").first()).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows approval composer notice and disables composer controls", async ({ page }) => {
    await seedPendingApprovalDraft(page);
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    await expect(page.getByText("Execution")).toBeVisible();
    await expect(page.getByRole("button", { name: /git_add done Approval pending/ })).toBeVisible();
    await expect(page.getByText("Approval pending").first()).toBeVisible();
    await expect(page.getByText("Approval pending:")).toBeVisible();
    await expect(page.getByText("Stage selected files for commit").first()).toBeVisible();
    await expect(page.getByPlaceholder(/Approve or cancel the pending action/)).toBeDisabled();
    await expect(page.getByTitle("Finish the current approval first.")).toHaveCount(4);
    await expect(page.getByTitle("Finish the current approval first.").first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps active Project Link long workflow transcript clear of the pinned summary", async ({ page }) => {
    await seedLongWorkflowTranscriptDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    const transcriptColumn = page.locator(".middle-panel-inner");
    const environmentCard = page.locator(".pointer-events-auto.rounded-2xl").filter({ hasText: "Environment" }).first();
    const approvalCard = page.getByText("Approve this command?").locator("xpath=ancestor::section[1]");

    await expect(page.getByText("Review my changes and stage the safe files")).toBeVisible();
    await expect(page.getByRole("button", { name: /Worked 3 commands/ })).toBeVisible();
    await expect(page.getByText("The diff is focused on local API wiring")).toBeVisible();
    await expect(page.getByText("git add -- src/app.ts src/api.ts")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, run this action" })).toBeVisible();
    await expect(environmentCard).toBeVisible();
    await expect(transcriptColumn).toBeVisible();
    await expect(approvalCard).toBeVisible();
    await expectNoHorizontalOverlap(transcriptColumn, environmentCard);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("queues suggestion replies while a restored workflow is running", async ({ page }) => {
    await seedRunningWorkflowDraft(page);
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    await expect(page.getByText("Working:")).toBeVisible();
    await expect(page.getByText("Inspecting workspace").first()).toBeVisible();
    await expect(page.getByPlaceholder("MergePilot is working...")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await page.getByRole("button", { name: "Commit message" }).click();
    await expect(page.getByText("Queued follow-up:")).toBeVisible();
    await expect(page.getByText("Commit message").first()).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Queued follow-up:")).toBeHidden();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes Git workflow follow-up chips as structured actions", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedFetchedGitWorkflowDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: `${payload.action} prepared`,
          workflowState: {
            status: "waiting_for_approval",
            workflowKind: "commit",
            workflowPhase: "push",
            currentStep: "Prepare push",
            completedTools: [],
          },
          tools: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Suggestion should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const pushFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Push branch" });
    await expect(pushFollowUp).toBeVisible();
    await pushFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "push_branch" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes review stage follow-up chip as a structured commit workflow", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedReviewedChangesDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Commit preparation approval created",
          workflowState: {
            status: "waiting_for_approval",
            workflowKind: "commit",
            workflowPhase: "stage",
            currentStep: "Stage all current changes",
            completedTools: [],
          },
          tools: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Stage follow-up should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const stageFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Stage selected" });
    await expect(stageFollowUp).toBeVisible();
    await stageFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({
      action: "prepare_commit",
      includeUnstaged: true,
      commitMode: "commit",
    });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes staged diff follow-up chip as a read-only workflow action", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedCommitReadyDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Changed files: README.md",
          workflowState: {
            status: "done",
            currentStep: "inspect_staged_changes complete",
            completedTools: ["git_status", "git_diff_staged", "git_diff_staged_name_only"],
          },
          tools: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Staged diff follow-up should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const stagedDiffFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Check staged diff" });
    await expect(stagedDiffFollowUp).toBeVisible();
    await stagedDiffFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "inspect_staged_changes" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes draft commit message follow-up chip as a read-only workflow action", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedCommitReadyDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Suggested commit message: `chore: update workspace changes`",
          workflowState: {
            status: "done",
            currentStep: "draft_commit_message complete",
            completedTools: ["git_status", "git_diff", "git_diff_staged", "git_log"],
          },
          tools: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Draft commit message should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const draftMessageFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Draft commit message" });
    await expect(draftMessageFollowUp).toBeVisible();
    await draftMessageFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "draft_commit_message" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes change-scope follow-up chip as a read-only workflow action", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedCommitReadyDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Change scope: 1 area(s), 1 file(s).",
          workflowState: {
            status: "done",
            currentStep: "explain_change_scope complete",
            completedTools: ["git_status", "git_diff", "git_diff_staged"],
          },
          tools: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Explain change scope should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const changeScopeFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Explain change scope" });
    await expect(changeScopeFollowUp).toBeVisible();
    await changeScopeFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "explain_change_scope" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes remote-target follow-up chip as a read-only workflow action", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedPushReadyDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Remote target: origin/main",
          workflowState: {
            status: "done",
            currentStep: "inspect_remote_target complete",
            completedTools: ["git_current_branch", "git_upstream", "git_divergence"],
          },
          tools: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Show remote target should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const remoteTargetFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Show remote target" });
    await expect(remoteTargetFollowUp).toBeVisible();
    await remoteTargetFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "inspect_remote_target" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes pushed-commit summary follow-up chip as a read-only workflow action", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedPushedCommitDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Latest commit: abc123 docs: local update",
          workflowState: {
            status: "done",
            currentStep: "inspect_latest_commit complete",
            completedTools: ["git_current_branch", "git_log_subject", "git_show_head_stat"],
          },
          tools: [],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Summarize push should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const summarizePushFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Summarize push" });
    await expect(summarizePushFollowUp).toBeVisible();
    await summarizePushFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "inspect_latest_commit" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes validation failure analysis follow-up chip as a read-only workflow action", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedValidationFailureDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Validation failure artifact: Test failure report\nFramework: vitest",
          workflowState: {
            status: "done",
            workflowKind: "ci",
            workflowPhase: "validation_failure_inspected",
            currentStep: "inspect_validation_failure complete",
            completedTools: ["validation_failure_artifact"],
          },
          tools: [
            {
              name: "validation_failure_artifact",
              command: "internal validation_failure_artifact",
              ok: true,
              stdout: "{}",
              stderr: "",
              returncode: 0,
            },
          ],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Analyze failure should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const analyzeFailureFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Analyze failure" });
    await expect(analyzeFailureFollowUp).toBeVisible();
    await analyzeFailureFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "inspect_validation_failure" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("routes PR validation recovery chip as a structured CI recovery workflow action", async ({ page }) => {
    const workflowPayloads: Array<Record<string, unknown>> = [];
    let chatRequestCount = 0;
    await seedPrCiRecoveryDraft(page);
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      workflowPayloads.push(payload);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          repoPath: payload.repoPath,
          summary: "Validation failure artifact: Test failure report\nPipeline failure artifact: Pipeline #12 run #77 failure",
          workflowState: {
            status: "done",
            workflowKind: "ci",
            workflowPhase: "ci_recovery_context_inspected",
            currentStep: "inspect_ci_recovery_context complete",
            completedTools: ["validation_failure_artifact", "pipeline_failure_artifact"],
          },
          tools: [
            {
              name: "validation_failure_artifact",
              command: "internal validation_failure_artifact",
              ok: true,
              stdout: "{}",
              stderr: "",
              returncode: 0,
            },
            {
              name: "pipeline_failure_artifact",
              command: "internal pipeline_failure_artifact",
              ok: true,
              stdout: "{}",
              stderr: "",
              returncode: 0,
            },
          ],
        }),
      });
    });
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Validation recovery should use workflow-action" }),
      });
    });

    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    const validationRecoveryFollowUp = page
      .locator('button[data-action-kind="workspace_action"]')
      .filter({ hasText: "Validation recovery" });
    await expect(validationRecoveryFollowUp).toBeVisible();
    await validationRecoveryFollowUp.click();

    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "inspect_ci_recovery_context" });
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows right-panel PR readiness step states during an active workflow", async ({ page }) => {
    await seedRunningPrReadinessWorkflowDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");
    await page.getByTitle("Expand context panel").click();

    const runningStep = page
      .locator('button[data-workflow-step-state="running"]')
      .filter({ hasText: "Review CI blockers" });
    const waitingPolicyStep = page
      .locator('button[data-workflow-step-state="waiting"]')
      .filter({ hasText: "Check policy blockers" });
    const waitingWorkItemStep = page
      .locator('button[data-workflow-step-state="waiting"]')
      .filter({ hasText: "Review work items" });

    await expect(runningStep).toBeVisible();
    await expect(runningStep).toContainText("Running");
    await expect(runningStep).toBeDisabled();
    await expect(waitingPolicyStep).toBeVisible();
    await expect(waitingPolicyStep).toContainText("Wait");
    await expect(waitingPolicyStep).toBeDisabled();
    await expect(waitingWorkItemStep).toBeVisible();
    await expect(waitingWorkItemStep).toContainText("Wait");
    await expect(waitingWorkItemStep).toBeDisabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders tool lifecycle from UI stream chunks without legacy tool events", async ({
    page,
  }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "ui-stream-session" } },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "text-1", delta: "I checked streamed " },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "text-1", delta: "tool output." },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-end", id: "text-1" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "metadata-available",
                metadata: {
                  risk_level: "low",
                  actions_taken: ["git_status"],
                  suggestions: ["Review diff"],
                  sources: [
                    {
                      type: "source_document",
                      source_id: "status-source",
                      title: "apps/desktop/src/pages/Chat.tsx",
                      file: "apps/desktop/src/pages/Chat.tsx",
                      line: 3904,
                      snippet: "handleUiChunk",
                    },
                  ],
                },
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-input-start",
                toolCallId: "call_status_1",
                toolName: "git_status",
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-input-available",
                toolCallId: "call_status_1",
                toolName: "git_status",
                input: { short: true, branch: true },
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-output-delta",
                toolCallId: "call_status_1",
                toolName: "git_status",
                stream: "stdout",
                delta: "## main\n M src/app.ts\n",
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-output-available",
                toolCallId: "call_status_1",
                toolName: "git_status",
                output: { stdout: "## main\n M src/app.ts\n", stderr: "", returncode: 0 },
                summary: "1 modified file",
              },
            },
          },
          {
            event: "done",
            data: {
              type: "done",
              result: {
                response: "I checked streamed tool output.",
                streamedResponse: "I checked streamed tool output.",
                finalizationMode: "agent_final",
                riskLevel: "low",
                actionsTaken: ["git_status"],
                suggestions: ["Review diff"],
                sources: [
                  {
                    type: "source_document",
                    sourceId: "status-source",
                    title: "apps/desktop/src/pages/Chat.tsx",
                    file: "apps/desktop/src/pages/Chat.tsx",
                    line: 3904,
                    snippet: "handleUiChunk",
                  },
                ],
              },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Run a streamed status check");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("I checked streamed tool output.")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /git_status done branch=true/ })).toBeVisible();
    await expect(page.getByText("1 modified file")).toBeVisible();
    await expect(page.getByText("References", { exact: true })).toBeVisible();
    await expect(page.getByText("apps/desktop/src/pages/Chat.tsx:line 3904")).toHaveCount(1);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("deduplicates legacy text and tool events after canonical UI chunks start", async ({
    page,
  }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "mixed-ui-legacy-stream-session" } },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-start", id: "mixed-text" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "mixed-text", delta: "Canonical status answer." },
            },
          },
          {
            event: "assistant_delta",
            data: { type: "assistant_delta", delta: "Legacy duplicate assistant delta." },
          },
          { event: "message", data: { type: "message", text: "Legacy final duplicate message." } },
          {
            event: "tool_start",
            data: { type: "tool_start", name: "git_status", args: { short: true } },
          },
          {
            event: "tool_output_delta",
            data: {
              type: "tool_output_delta",
              name: "git_status",
              stream: "stdout",
              delta: "legacy duplicate tool output",
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-input-available",
                toolCallId: "call_status_mixed",
                toolName: "git_status",
                input: { short: true },
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-output-available",
                toolCallId: "call_status_mixed",
                toolName: "git_status",
                output: { stdout: "## main\n M src/app.ts\n", stderr: "", returncode: 0 },
                summary: "canonical status summary",
              },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-end", id: "mixed-text" } },
          },
          {
            event: "done",
            data: {
              type: "done",
              result: {
                response: "Canonical status answer.",
                streamedResponse: "Canonical status answer.",
                finalizationMode: "agent_final",
                riskLevel: "low",
                actionsTaken: ["git_status"],
                suggestions: [],
              },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page
      .getByPlaceholder(/Ask (MergePilot|MergePilot)/)
      .fill("Run a mixed canonical and legacy stream");
    await page.getByRole("button", { name: /Send/ }).click();

    await expect(page.getByText("Canonical status answer.")).toHaveCount(1);
    await expect(page.getByText("Legacy duplicate assistant delta.")).toHaveCount(0);
    await expect(page.getByText("Legacy final duplicate message.")).toHaveCount(0);
    await expect(page.getByText("legacy duplicate tool output")).toHaveCount(0);
    await expect(page.getByText("1 step · 1 command")).toHaveCount(1);
    await expect(page.getByText("canonical status summary")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask (MergePilot|MergePilot)/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders approval cards from canonical UI chunks without legacy approval events", async ({
    page,
  }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "canonical-approval-session" } },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "approval-required",
                approval: {
                  id: "approval-git-add",
                  riskLevel: "medium",
                  explanation: "Review exact git add args before staging selected files.",
                  action: {
                    tool: "git_add",
                    args: { paths: ["apps/desktop/src/pages/Chat.tsx"] },
                    description: "Stage selected files for commit",
                    nextHint: "Continue to commit after staging.",
                    workflow: {
                      kind: "commit",
                      phase: "stage",
                      message: "Stage selected files for commit",
                    },
                  },
                },
              },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask (MergePilot|MergePilot)/).fill("Prepare a staged commit");
    await page.getByRole("button", { name: /Send/ }).click();

    await expect(page.getByText("Approval required")).toBeVisible();
    await expect(page.getByText("git_add").first()).toBeVisible();
    await expect(
      page.getByText("Review exact git add args before staging selected files."),
    ).toBeVisible();
    await expect(page.getByText("Continue to commit after staging.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders long streamed markdown with sources and tool output", async ({ page }) => {
    const longMarkdown = [
      "## Review Plan",
      "",
      "The agent inspected the branch and kept the response as a single streamed answer.",
      "",
      "| Area | Result |",
      "| --- | --- |",
      "| Git status | Review required |",
      "| CI checks | Pending follow-up |",
      "",
      "```powershell",
      ".\\scripts\\windows\\pnpm-project.ps1 --filter @mergepilot/desktop typecheck",
      "```",
      "",
      ...Array.from(
        { length: 18 },
        (_, index) =>
          `- Step ${index + 1}: preserve context, cite evidence, and avoid hidden workflow jumps.`,
      ),
      "",
      "Next action: inspect the risk before preparing a commit.",
    ].join("\n");
    const firstChunk = longMarkdown.slice(0, 560);
    const secondChunk = longMarkdown.slice(560);

    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "long-ui-stream-session" } },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-start", id: "long-text" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "long-text", delta: firstChunk },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-output-delta",
                toolCallId: "call_diff_1",
                toolName: "git_diff",
                stream: "stdout",
                delta:
                  "diff --git a/apps/desktop/src/pages/Chat.tsx b/apps/desktop/src/pages/Chat.tsx\n",
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-output-delta",
                toolCallId: "call_diff_1",
                toolName: "git_diff",
                stream: "stdout",
                delta: "+streamed markdown keeps references attached\n",
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "long-text", delta: secondChunk },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-end", id: "long-text" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "metadata-available",
                metadata: {
                  risk_level: "medium",
                  actions_taken: ["git_diff"],
                  suggestions: ["Run tests"],
                  sources: [
                    {
                      type: "source_document",
                      source_id: "long-chat-source",
                      title: "apps/desktop/src/pages/Chat.tsx",
                      file: "apps/desktop/src/pages/Chat.tsx",
                      line: 3942,
                      snippet: "UI stream error handling preserves composer state.",
                    },
                    {
                      type: "source_url",
                      source_id: "stream-doc",
                      title: "Streaming UI protocol",
                      url: "https://example.com/streaming-ui",
                    },
                  ],
                },
              },
            },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-output-available",
                toolCallId: "call_diff_1",
                toolName: "git_diff",
                output: {
                  stdout:
                    "diff --git a/apps/desktop/src/pages/Chat.tsx b/apps/desktop/src/pages/Chat.tsx\n+streamed markdown keeps references attached\n",
                  stderr: "",
                  returncode: 0,
                },
                summary: "diff inspected",
              },
            },
          },
          {
            event: "done",
            data: {
              type: "done",
              result: {
                response: longMarkdown,
                streamedResponse: longMarkdown,
                finalizationMode: "agent_final",
                riskLevel: "medium",
                actionsTaken: ["git_diff"],
                suggestions: ["Run tests"],
                sources: [
                  {
                    type: "source_document",
                    sourceId: "long-chat-source",
                    title: "apps/desktop/src/pages/Chat.tsx",
                    file: "apps/desktop/src/pages/Chat.tsx",
                    line: 3942,
                    snippet: "UI stream error handling preserves composer state.",
                  },
                  {
                    type: "source_url",
                    sourceId: "stream-doc",
                    title: "Streaming UI protocol",
                    url: "https://example.com/streaming-ui",
                  },
                ],
              },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Stream a long review with sources");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Review Plan" })).toHaveCount(1);
    await expect(page.getByText("Step 18: preserve context")).toBeVisible();
    await expect(page.getByText("diff inspected")).toBeVisible();
    await expect(page.getByRole("button", { name: /git_diff done/ })).toBeVisible();
    await expect(page.getByText("References", { exact: true })).toBeVisible();
    await expect(page.getByText("apps/desktop/src/pages/Chat.tsx:line 3942")).toHaveCount(1);
    await expect(page.getByText("Streaming UI protocol")).toHaveCount(1);
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("preserves manual history scroll when a delayed response arrives", async ({ page }) => {
    await seedLongHistoryDraft(page);
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "scroll-preservation-session" } },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-start", id: "scroll-text" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "text-delta",
                id: "scroll-text",
                delta: "Answer that should not yank scroll.",
              },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-end", id: "scroll-text" } },
          },
          {
            event: "done",
            data: {
              type: "done",
              result: {
                response: "Answer that should not yank scroll.",
                streamedResponse: "Answer that should not yank scroll.",
                finalizationMode: "agent_final",
                riskLevel: "low",
                actionsTaken: [],
                suggestions: [],
              },
            },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");
    const messagePanel = page.getByTestId("chat-message-panel");
    await expect(messagePanel).toBeVisible();
    await messagePanel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    await page.getByPlaceholder(/Ask MergePilot/).fill("Continue while I read earlier context");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await messagePanel.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect(page.getByText("Answer that should not yank scroll.")).toHaveCount(1);
    const scrollTopAfterResponse = await messagePanel.evaluate((element) => element.scrollTop);
    expect(scrollTopAfterResponse).toBeLessThan(80);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("stops an in-flight chat request and ignores a late response", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route
        .fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse([
            { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
            { event: "session", data: { sessionId: "cancelled-ui-stream-session" } },
            {
              event: "ui.chunk",
              data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } },
            },
            {
              event: "ui.chunk",
              data: {
                type: "ui.chunk",
                chunk: { type: "text-delta", id: "text-1", delta: "Late answer after stop." },
              },
            },
            {
              event: "ui.chunk",
              data: { type: "ui.chunk", chunk: { type: "text-end", id: "text-1" } },
            },
            {
              event: "done",
              data: {
                type: "done",
                result: {
                  response: "Late answer after stop.",
                  streamedResponse: "Late answer after stop.",
                  finalizationMode: "agent_final",
                  riskLevel: "low",
                  actionsTaken: [],
                  suggestions: [],
                },
              },
            },
          ]),
        })
        .catch(() => undefined);
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Start a cancellable stream");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled();

    await page.waitForTimeout(1100);
    await expect(page.getByText("Late answer after stop.")).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("releases the composer after a UI-stream-only finish", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "ui-stream-only-finish-session" } },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "text-1", delta: "Standalone UI stream completed." },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-end", id: "text-1" } },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Run a UI stream only response");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Standalone UI stream completed.")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("restores interrupted streaming drafts as stable completed text", async ({ page }) => {
    await seedInterruptedStreamingDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(
      page.getByText("Partial architecture answer before the page was reloaded."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("deduplicates legacy and UI stream error events", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "error-ui-stream-session" } },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "text-1", delta: "Partial answer before failure." },
            },
          },
          {
            event: "error",
            data: { type: "error", message: "Stream failed while reading tool output." },
          },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "error", errorText: "Stream failed while reading tool output." },
            },
          },
          {
            event: "ui.chunk",
            data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "error" } },
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Trigger a duplicated stream error");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Partial answer before failure.")).toBeVisible();
    await expect(page.getByText("Stream failed while reading tool output.")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("opens the result workspace shell from an artifact card", async ({ page }, testInfo) => {
    await seedArtifactDraft(page);
    await page.context().grantPermissions(["clipboard-write"], { origin: "http://127.0.0.1:1420" });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(page.getByText("Project architecture diagram")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Open artifact workspace for Project architecture diagram",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Open artifact workspace for Project architecture diagram" })
      .click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("artifact-architecture")).toBeVisible();
    await expect(
      page.getByText("Rendered Mermaid diagram. Source remains available below."),
    ).toBeVisible();
    await expect(page.getByTestId("mermaid-artifact-svg").locator("svg")).toBeVisible();
    await expect(page.getByText("flowchart TD")).toBeVisible();
    await expect(page.getByText("UI[Desktop chat] --> Agent[MergePilot]")).toBeVisible();
    await page.getByRole("button", { name: "Copy content" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("project-architecture-diagram.mmd");
    const downloadPath = testInfo.outputPath("project-architecture-diagram.mmd");
    await download.saveAs(downloadPath);
    await expect(page.getByRole("button", { name: "Download started" })).toBeVisible();
    await expect(await readFile(downloadPath, "utf8")).toContain("Agent --> ADO[Azure DevOps]");

    await page
      .getByRole("button", { name: "Open artifact workspace for PR insight report" })
      .click();
    await expect(page.getByText("artifact-report")).toBeVisible();
    await expect(page.getByRole("heading", { name: "PR insight" })).toBeVisible();
    await expect(page.getByText("Decision: review before merge")).toBeVisible();

    await page.getByRole("button", { name: "Open artifact workspace for Review notes" }).click();
    await expect(page.getByText("artifact-notes")).toBeVisible();
    await expect(page.getByText("File changes look focused.")).toBeVisible();
    await expect(page.getByText("No blocking issue found.")).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows Mermaid render errors without hiding the source", async ({ page }) => {
    await seedInvalidMermaidArtifactDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await page
      .getByRole("button", { name: "Open artifact workspace for Broken Mermaid diagram" })
      .click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("Mermaid render failed")).toBeVisible();
    await expect(page.getByText("flowchart TD")).toBeVisible();
    await expect(page.locator("pre").filter({ hasText: "A -->" })).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders project-context source references in the conversation", async ({ page }) => {
    await seedSourceReferenceDraft(page);
    await mockWorkspaceFilePreview(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(page.getByText("Explain this project architecture")).toBeVisible();
    await expect(page.getByText("The Conversation page coordinates the desktop UI")).toBeVisible();
    await expect(page.getByRole("button", { name: "chatContext" })).toBeVisible();

    const expandCodePanel = page.getByTitle("Expand code panel");
    if (await expandCodePanel.count()) await expandCodePanel.click();
    const rightPanel = page.locator(".right-panel");
    await expectRightShellSplitStartsAtTop(page);
    await expectSummaryToggleNearRightSplit(page);
    await expect(rightPanel.getByText("No file open")).toBeVisible();
    await expect(rightPanel.getByText("Select a reference.")).toHaveCount(0);
    await expect(rightPanel.getByRole("button", { name: /Chat\.tsx/ })).toHaveCount(0);
    await expect(rightPanel.locator('button[aria-pressed="true"]').filter({ hasText: "chatContext.ts" })).toHaveCount(0);

    await page.getByRole("button", { name: "chatContext" }).click();

    await expect(rightPanel.locator('button[aria-pressed="true"]').filter({ hasText: "chatContext.ts" })).toHaveCount(1);
    await expect(rightPanel.getByRole("button", { name: /Chat\.tsx/ })).toHaveCount(0);
    await expect(rightPanel.getByText("300 lines")).toBeVisible();
    await expect(rightPanel.getByText("line 291")).toBeVisible();
    await expect(rightPanel.locator(".cm-sourceTargetLine")).toContainText("previewLine291");
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("supports source preview copy actions and tab cleanup", async ({ page }) => {
    await seedSourceReferenceDraft(page);
    await mockWorkspaceFilePreview(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:1420" });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    const expandCodePanel = page.getByTitle("Expand code panel");
    if (await expandCodePanel.count()) await expandCodePanel.click();
    const rightPanel = page.locator(".right-panel");
    await page.getByRole("button", { name: "chatContext" }).click();

    await expect(rightPanel.getByText("300 lines")).toBeVisible();
    await rightPanel.getByRole("button", { name: "Path" }).click();
    await expect(rightPanel.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("packages/core/src/chatContext.ts");

    await rightPanel.getByRole("button", { name: "Copy" }).click();
    await expect(rightPanel.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("previewLine291");

    await rightPanel.getByRole("button", { name: "Close chatContext.ts" }).click();
    await expect(rightPanel.getByText("No file open")).toBeVisible();
    await expect(rightPanel.getByRole("button", { name: /chatContext\.ts/ })).toHaveCount(0);

    await page.getByRole("button", { name: "chatContext" }).click();
    await expect(rightPanel.getByRole("button", { name: "chatContext.ts", exact: true })).toBeVisible();
    await rightPanel.getByRole("button", { name: "Close all files" }).click();
    await expect(rightPanel.getByText("No file open")).toBeVisible();
    await expect(rightPanel.getByRole("button", { name: /chatContext\.ts/ })).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("loads a saved PR insight artifact source into the result workspace", async ({ page }) => {
    const workflowPayloads: unknown[] = [];
    await page.route("http://127.0.0.1:8787/chat/workflow-action", async (route) => {
      workflowPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: "run_tests",
          repoPath: profile.repoPath,
          summary: "Validation rerun requested from saved PR blocker metadata.",
          workflowState: {
            status: "done",
            workflowKind: "ci",
            workflowPhase: "test_passed",
            currentStep: "Validation complete",
            completedTools: ["test_command"],
          },
          tools: [],
        }),
      });
    });
    await seedSavedPrInsightSourceDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(page.getByText("Saved PR insight source")).toBeVisible();
    const readinessActions = page.locator("button[data-action-kind='workspace_action']");
    await expect(readinessActions.filter({ hasText: "Rerun validation" })).toBeVisible();
    await expect(readinessActions.filter({ hasText: "Policy status" })).toBeVisible();
    await expect(readinessActions.filter({ hasText: "Work items" })).toBeVisible();
    await page.getByRole("button", { name: "Open workspace" }).click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading saved PR insight artifact...")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved PR insight review" })).toBeVisible();
    await expect(
      page.getByText("Persisted review says the PR needs one human check before merge."),
    ).toBeVisible();
    await expect(page.getByText("Policy status should be checked before merge.")).toBeVisible();
    await expect(page.getByText("Failed policies: 1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build blockers" })).toBeVisible();
    await expect(page.getByText("#77 20260610.1 CI: failed (https://ado/build/77)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Policy blockers" })).toBeVisible();
    await expect(
      page.getByText("Minimum reviewers: failed (blocking)", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active threads" })).toBeVisible();
    await expect(page.getByText("#5 Ada: Needs tests")).toBeVisible();
    await readinessActions.filter({ hasText: "Rerun validation" }).click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "run_tests" });
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows persisted PR insight lookup errors in the result workspace", async ({ page }) => {
    await seedSavedPrInsightSourceDraft(page);
    await page.route(
      /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/pr-insights\/artifact\?.*/,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "artifact not found" }),
        });
      },
    );
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await page.getByRole("button", { name: "Open workspace" }).click();

    await expect(page.getByText("Saved artifact unavailable")).toBeVisible();
    await expect(
      page.getByText("/project-links/pw-profile/pr-insights/artifact HTTP 404"),
    ).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("does not look up ordinary artifact shells as PR insight artifacts", async ({ page }) => {
    let lookupCount = 0;
    await seedUnbackedArtifactDraft(page);
    await page.route(
      "http://127.0.0.1:8787/project-links/pw-profile/pr-insights/artifact?artifactId=artifact-unbacked-report",
      async (route) => {
        lookupCount += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "ordinary artifacts must not call this route" }),
        });
      },
    );
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await page
      .getByRole("button", { name: "Open artifact workspace for Unbacked report shell" })
      .click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Markdown report rendering will be added in the next artifact content batch."),
    ).toBeVisible();
    await page.waitForTimeout(250);
    expect(lookupCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });
});
