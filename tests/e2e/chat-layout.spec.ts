import { readFile, writeFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { evaluateAiInsightAnswer } from "../../packages/core/src/aiInsightQuality";

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

const prInsightArtifactRoute = /http:\/\/127\.0\.0\.1:8787\/project-links\/[^/]+\/pr-insights\/artifact\?.*/;

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
    prInsightArtifactRoute,
    async (route) => {
      const url = new URL(route.request().url());
      const artifactId = url.searchParams.get("artifactId") ?? "";
      if (artifactId === "missing-artifact") {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "artifact not found" }),
        });
        return;
      }
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
              workItemCount: 1,
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
              linkedWorkItems: [
                {
                  id: 123,
                  type: "User Story",
                  state: "Active",
                  title: "Improve agent insight",
                  url: "https://ado/workItems/123",
                },
              ],
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

function workflowChatSse(args: {
  sessionId: string;
  textId: string;
  clientTurnId?: string;
  summary: string;
  workflowState: Record<string, unknown>;
  tools: Array<{
    id: string;
    name: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    summary?: string;
  }>;
}): string {
  // The daemon's Timeline is the only live presentation channel: legacy SSE
  // `done` and `ui.chunk` projections are confined to history adapters. This
  // mock mirrors the timeline handshake (turn.started adoption -> narrative
  // -> tool events -> workflow -> terminals) so mocked turns seal exactly
  // like real ones.
  const now = Date.now();
  const events: Array<{ event: string; data: unknown }> = [
    { event: "turn.started", data: { type: "turn.started", turnId: "mock-turn", clientTurnId: args.clientTurnId, sequence: 0, emittedAt: now } },
    { event: "session", data: { sessionId: args.sessionId } },
    { event: "turn.narrative.delta", data: { type: "turn.narrative.delta", turnId: "mock-turn", sequence: 1, emittedAt: now, blockId: "mock-narrative", delta: args.summary } },
  ];
  let sequence = 2;
  for (const tool of args.tools) {
    events.push(
      { event: "turn.tool.started", data: { type: "turn.tool.started", turnId: "mock-turn", sequence: sequence++, emittedAt: now, groupId: "mock-group", commandId: tool.id, name: tool.name, args: tool.input ?? {} } },
      { event: "turn.tool.completed", data: { type: "turn.tool.completed", turnId: "mock-turn", sequence: sequence++, emittedAt: now, groupId: "mock-group", commandId: tool.id, name: tool.name, ok: true, summary: tool.summary ?? "Success", output: typeof tool.output === "string" ? tool.output : JSON.stringify(tool.output ?? {}) } },
    );
  }
  events.push(
    { event: "turn.workflow.updated", data: { type: "turn.workflow.updated", turnId: "mock-turn", sequence: sequence++, emittedAt: now, workflow: args.workflowState } },
    { event: "turn.execution.completed", data: { type: "turn.execution.completed", turnId: "mock-turn", sequence: sequence++, emittedAt: now, elapsedMs: 1 } },
    { event: "turn.final.delta", data: { type: "turn.final.delta", turnId: "mock-turn", sequence: sequence++, emittedAt: now, delta: args.summary } },
    { event: "turn.final.completed", data: { type: "turn.final.completed", turnId: "mock-turn", sequence: sequence++, emittedAt: now, finalText: args.summary, evidence: [] } },
    { event: "turn.finished", data: { type: "turn.finished", turnId: "mock-turn", sequence: sequence++, emittedAt: now, status: "completed" } },
  );
  return sse(events);
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
            meta: {
              suggestions: ["Commit message"],
            },
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

async function seedSavedPrInsightSourceDraft(
  page: Page,
  artifactId = "pw-profile/CICD-agents/42/review_run/2026-06-13T07%3A30%3A00.000Z",
): Promise<void> {
  await page.addInitScript(({ seedProfile, sourceArtifactId }) => {
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
                `Used saved PR AI insight artifact ${sourceArtifactId} for PR #42 (review_run, 2026-06-13T07:30:00.000Z).`,
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
  }, { seedProfile: profile, sourceArtifactId: artifactId });
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
            parts: [
              {
                type: "markdown",
                markdown:
                  "The Chat.tsx shell at apps/desktop/src/pages/Chat.tsx coordinates the desktop UI, while the chatContext.ts module at packages/core/src/chatContext.ts builds repository grounding for project-specific architecture answers.",
              },
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

async function mockWorkspaceFilePreview(page: Page): Promise<Array<{ repoPath?: string; filePath?: string }>> {
  const previewRequests: Array<{ repoPath?: string; filePath?: string }> = [];
  await page.route("http://127.0.0.1:8787/workspace/file", async (route) => {
    const payload = await route.request().postDataJSON() as { repoPath?: string; filePath?: string };
    previewRequests.push(payload);
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
  return previewRequests;
}

async function openPinnedSummary(page: Page): Promise<void> {
  const environment = page.getByText("Environment").first();
  if (!(await environment.isVisible().catch(() => false))) {
    await page.getByTitle("Show pinned summary").click();
  }
  await expect(environment).toBeVisible();
}

test.describe("Chat layout", () => {
  test.beforeEach(async ({ page }) => {
    await mockRuntime(page);
  });

  test("@smoke @mocked keeps the project-linked chat shell inside the viewport", async ({ page }) => {
    // This is the first chat-route hit in this Playwright process. A fresh
    // Vite compiles the lazy chat chunk graph on demand; budget that compile
    // here (it is the compilation, not assertion relaxation) so the shell
    // assertions below measure layout, not the compiler.
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await expect(page.getByText("Start with a focused prompt")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeVisible();
    await expect(page.getByTitle("Conversation model")).toContainText("GPT-5 mini");
    await expectNoVisibleHorizontalOverflow(page);

    await openPinnedSummary(page);
    await expect(page.getByText("Commit or push")).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);

    await page.getByTitle("Conversation model").click();
    await expect(page.getByText("Model", { exact: true })).toBeVisible();
    await expect(page.getByText("GPT-5 mini").last()).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("@smoke @mocked gives the chat workspace usable width when maximized", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 920 });
    await page.goto("/chat?new=1");

    await expect(page.getByText("Start with a focused prompt")).toBeVisible();
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toBeVisible();
    const transcriptColumn = page.locator(".middle-panel-inner");
    const welcomePanel = page.locator('[aria-label="New conversation welcome"]');
    await expect(transcriptColumn).toBeVisible();
    await expect(welcomePanel).toBeVisible();

    const columnBox = await transcriptColumn.boundingBox();
    const welcomeBox = await welcomePanel.boundingBox();
    expect(columnBox).not.toBeNull();
    expect(welcomeBox).not.toBeNull();
    expect(columnBox?.width ?? 0).toBeGreaterThan(760);
    expect(columnBox?.width ?? 0).toBeLessThanOrEqual(1000);
    expect(welcomeBox?.width ?? 0).toBeGreaterThan(760);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps the Project Link onboarding form usable on narrow screens", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_project_links_v1", "[]");
      localStorage.removeItem("mergepilot_active_project_link_id");
    });
    await page.setViewportSize({ width: 836, height: 768 });
    await page.goto("/chat?new=1");

    await expect(page.getByText("Start with a focused prompt")).toBeVisible();
    await page.getByText("Connect a project").click();
    await expect(page.getByPlaceholder("web-app production")).toBeVisible();
    await expect(page.getByPlaceholder("C:\\projects\\my-app")).toBeVisible();
    // V2 Project Link creation saves only the stable identity mapping: the
    // Default branch / PR target branch fields are gone from the form.
    await expect(page.getByText("Default branch")).toHaveCount(0);
    await expect(page.getByText("PR target branch")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create and use" })).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps empty New Chat free of preloaded command templates", async ({
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
          summary: "Commit preparation prepared",
          workflowState: {
            status: "done",
            workflowKind: "commit",
            workflowPhase: "prepared",
            currentStep: "Commit prepared",
            completedTools: [],
          },
          tools: [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await openPinnedSummary(page);

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

  test("keeps commit actions enabled without branch divergence gating", async ({ page }) => {
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

    await openPinnedSummary(page);
    await page.getByRole("button", { name: "Commit or push" }).click();
    // Context no longer shows divergence: the notice and the sync-branch
    // action were removed, and commit/push actions are never divergence-gated.
    await expect(page.getByText("Diverged: 1 ahead, 2 behind")).toHaveCount(0);
    await expect(page.getByText("Include unstaged changes")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pull with rebase before pushing" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prepare commit", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Prepare commit and push" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Push branch" })).toBeEnabled();
    await page.keyboard.press("Escape");
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

    await openPinnedSummary(page);
    await page.getByLabel("Workspace summary").getByText("Progress").click();
    const refreshProgressStep = page
      .locator('button[data-workflow-step-state="idle"]')
      .filter({ hasText: "Refresh branch status" });
    await expect(refreshProgressStep).toBeVisible();
    await refreshProgressStep.click();
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
    await openPinnedSummary(page);

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

    await expect(page.getByLabel("Pinned Summary Project Link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByText("Include unstaged changes")).toBeHidden();
  });

  test("keeps the pinned summary hidden during empty Project Link onboarding", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "unexpected chat" }) });
    });
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

    await expect(page.getByText("Connect a project")).toBeVisible();
    await expect(page.getByText("No Project Link yet — create one above")).toHaveCount(0);
    await expect(page.getByPlaceholder("Create or select a Project Link first...")).toHaveCount(0);
    await expect(page.getByLabel("Send message")).toHaveCount(0);
    await expect(page.getByText("Environment")).toHaveCount(0);
    expect(chatPayloads).toHaveLength(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("infers Azure DevOps fields while creating a Project Link from a local repo", async ({ page }) => {
    const repoPath = "C:\\work\\ClaimBot_API";
    const createPayloads: Array<Record<string, unknown>> = [];

    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        createPayloads.push(payload);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ...payload,
            id: "created-claimbot-link",
            createdAt: 1,
            updatedAt: 1,
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(/http:\/\/127\.0\.0\.1:8787\/git\/branches.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ branches: ["feature/work", "main"] }),
      });
    });
    await page.route(/http:\/\/127\.0\.0\.1:8787\/git\/azure-devops-remote.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestion: {
            remoteName: "origin",
            remoteUrl: "https://dev.azure.com/example/Claims/_git/ClaimBot_API",
            adoOrgUrl: "https://dev.azure.com/example/",
            adoProject: "Claims",
            adoRepoName: "ClaimBot_API",
          },
        }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([]));
      localStorage.removeItem("mergepilot_active_project_link_id");
      localStorage.removeItem("chat_repo");
      sessionStorage.removeItem("dev_agent_chat_draft_v1");
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await page.getByText("Connect a project").click();
    await page.getByPlaceholder("C:\\projects\\my-app").fill(repoPath);
    await expect(page.getByText("2 branches found")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Create and use" }).click();

    await expect.poll(() => createPayloads.length).toBe(1);
    expect(createPayloads[0]).toMatchObject({
      name: "ClaimBot_API link",
      repoPath,
      adoOrgUrl: "https://dev.azure.com/example/",
      adoProject: "Claims",
      adoRepoName: "ClaimBot_API",
      adoPat: "",
    });
    // V2 Project Links persist only the stable identity mapping; branch and
    // connector fields are no longer written from the create form.
    expect(createPayloads[0]).not.toHaveProperty("defaultBranch");
    expect(createPayloads[0]).not.toHaveProperty("targetBranch");
    expect(createPayloads[0]).not.toHaveProperty("adoPipelineId");
    expect(createPayloads[0]).not.toHaveProperty("adoPipelineName");
    expect(createPayloads[0]).not.toHaveProperty("adoMcpEnabled");
    await expect(page.getByTitle("Context manages the Project Link")).toHaveText("ClaimBot_API link");
    await expect(page.locator('select[aria-label="Composer Project Link"]')).toHaveCount(0);
    await expect(page.getByPlaceholder("Ask MergePilot...")).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps Project Link creation free of pipeline discovery and fields", async ({ page }) => {
    const repoPath = "C:\\work\\ClaimBot_API";
    const createPayloads: Array<Record<string, unknown>> = [];
    const discoveryPayloads: Array<Record<string, unknown>> = [];

    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        createPayloads.push(payload);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ...payload,
            id: "created-claimbot-pipeline-link",
            createdAt: 1,
            updatedAt: 1,
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      discoveryPayloads.push(payload);
      const kind = payload.kind;
      const items =
        kind === "projects"
          ? [
              { id: "project-other", name: "OtherProject", description: "", url: "" },
              { id: "project-claims", name: "Claims", description: "", url: "" },
            ]
          : kind === "repositories"
            ? [
                { id: "repo-other", name: "OtherRepo", description: "", url: "" },
                { id: "repo-claimbot", name: "ClaimBot_API", description: "", url: "" },
              ]
            : [
                {
                  id: "108",
                  name: "TeBS-ClaimBot",
                  description: "\\ · repo:TeBS-ClaimBot · type:TfsGit · yaml:/azure-pipelines.yml",
                  url: "https://dev.azure.com/example/Claims/_build?definitionId=108",
                },
                {
                  id: "117",
                  name: "ClaimBot_API",
                  description: "\\ · repo:ClaimBot_API · type:TfsGit · yaml:/azure-pipelines.yml",
                  url: "https://dev.azure.com/example/Claims/_build?definitionId=117",
                },
              ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ source: "internal", kind, items }),
      });
    });
    await page.route(/http:\/\/127\.0\.0\.1:8787\/git\/branches.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ branches: ["main"] }),
      });
    });
    await page.route(/http:\/\/127\.0\.0\.1:8787\/git\/azure-devops-remote.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ suggestion: null }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([]));
      localStorage.removeItem("mergepilot_active_project_link_id");
      localStorage.removeItem("chat_repo");
      sessionStorage.removeItem("dev_agent_chat_draft_v1");
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByText("Connect a project").click();
    await page.getByPlaceholder("C:\\projects\\my-app").fill(repoPath);
    await expect(page.getByText("1 branches found")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Azure DevOps" }).click();

    await page.locator('select[aria-label="Azure DevOps project"]').selectOption("Claims", { timeout: 8_000 });
    await page.locator('select[aria-label="Azure DevOps repository"]').selectOption("ClaimBot_API", { timeout: 8_000 });
    // V2 Project Links never discover or persist pipeline fields: the
    // pipeline selector is gone even when multiple pipelines exist.
    await expect(page.locator('select[aria-label="Azure Pipeline"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Create and use" }).click();

    await expect.poll(() => createPayloads.length).toBe(1);
    expect(createPayloads[0]).toMatchObject({
      name: "ClaimBot_API link",
      repoPath,
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "Claims",
      adoRepoName: "ClaimBot_API",
    });
    expect(createPayloads[0]).not.toHaveProperty("adoPipelineId");
    expect(createPayloads[0]).not.toHaveProperty("adoPipelineName");
    expect(discoveryPayloads.map((payload) => payload.kind)).toEqual(
      expect.arrayContaining(["projects", "repositories"]),
    );
    expect(discoveryPayloads.map((payload) => payload.kind)).not.toContain("pipelines");
    await expect(page.getByTitle("Context manages the Project Link")).toHaveText("ClaimBot_API link");
    await expect(page.locator('select[aria-label="Composer Project Link"]')).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("sends image attachments from the compact composer add menu", async ({ page }, testInfo) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "image-attachment-session",
          textId: "image-attachment-text",
          summary: "Image received.",
          workflowState: {},
          tools: [],
        }),
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
        body: workflowChatSse({
          sessionId: "dropped-image-session",
          textId: "dropped-image-text",
          summary: "Dropped image received.",
          workflowState: {},
          tools: [],
        }),
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
        body: workflowChatSse({
          sessionId: "pasted-image-session",
          textId: "pasted-image-text",
          summary: "Pasted image received.",
          workflowState: {},
          tools: [],
        }),
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

  test("@smoke @mocked routes PR insight controls without requiring a typed PR id", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    const workflowPayloads: Array<Record<string, unknown>> = [];
    const prSummary =
      "PR #2655 readiness: reviewable. 16 changed file(s), 0 failed/canceled build(s), 0 failed policy evaluation(s).";
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "pr-insight-chat-session",
          textId: "pr-insight-text",
          summary: prSummary,
          workflowState: {
            status: "done",
            workflowKind: "pr",
            workflowPhase: "inspected",
            currentStep: "PR readiness inspected",
            completedTools: ["ado_get_pull_request_by_id"],
          },
          tools: [
            {
              id: "pr-detail-2655",
              name: "ado_get_pull_request_by_id",
              input: { pullRequestId: 2655 },
              output: { stdout: "{\"pullRequestId\":2655}", stderr: "", returncode: 0 },
            },
          ],
        }),
      });
    });
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
              ? prSummary
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
    await page.getByPlaceholder(/Ask MergePilot/).fill("Analyze PR 2655 for this repo. Read-only only. Do not modify anything or request approval.");
    await page.getByLabel("Send message").click();

    await expect.poll(() => chatPayloads.length).toBe(1);
    await expect.poll(() => page.locator('[data-action-kind="workspace_action"]').count()).toBe(3);
    // The derived PR controls surface the exact workspace actions without a
    // typed PR id; picking one fills the composer with its message (the
    // payload contract itself is covered by the derivation unit tests and
    // the daemon workflow-action route tests).
    const actions = page.locator('[data-action-kind="workspace_action"]');
    await expect(actions).toContainText(["Check PR risks", "Rerun validation", "Check policy"]);
    await page.getByRole("button", { name: "Check PR risks" }).click();
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Summarize the main PR risks and what evidence supports them.",
    );
    await expect(page.getByRole("button", { name: "List work items" })).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("@smoke @mocked routes pipeline controls as explicit structured CI workflow actions", async ({ page }) => {
    const claimBotPipelineProfile = {
      ...profile,
      id: "claimbot-api-pipeline-profile",
      name: "ClaimBot_API link",
      repoPath: "C:\\Users\\15492\\Develop\\ClaimBot_API Nov 2025\\ClaimBot_API",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      adoPipelineId: "117",
      adoPipelineName: "ClaimBot_API",
    };
    const workflowPayloads: Array<Record<string, unknown>> = [];
    await page.unroute("http://127.0.0.1:8787/project-links");
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([claimBotPipelineProfile]),
      });
    });
    await page.addInitScript((seedProfile) => {
      localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([seedProfile]));
      localStorage.setItem("mergepilot_active_project_link_id", seedProfile.id);
      localStorage.setItem("chat_repo", seedProfile.repoPath);
    }, claimBotPipelineProfile);
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("http://127.0.0.1:8787/project-links/*/pull-requests*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "internal",
          kind: "pipelines",
          items: [
            {
              id: "117",
              name: "ClaimBot_API",
              description: "CI",
              url: "https://ado/pipelines/117",
            },
          ],
        }),
      });
    });
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
              ? "Pipeline #117 latest run #4665 20260705.1: completed/failed."
              : "Trigger Azure Pipeline #117 on main.",
          workflowState:
            payload.action === "inspect_pipeline"
              ? {
                  status: "done",
                  workflowKind: "ci",
                  workflowPhase: "pipeline_inspected",
                  currentStep: "Pipeline #117 readiness inspected",
                  completedTools: ["ado_list_pipeline_runs", "ado_get_build_timeline", "ado_get_build_log_excerpt"],
                }
              : {
                  status: "waiting_for_approval",
                  workflowKind: "ci",
                  workflowPhase: "waiting_for_pipeline_trigger_approval",
                  currentStep: "Trigger Azure Pipeline #117 on main.",
                  completedTools: [],
                  pendingApproval: {
                    id: "approval_pipeline",
                    riskLevel: "high",
                    explanation: "Trigger Azure Pipeline #117 on main.",
                    action: {
                      tool: "ado_trigger_pipeline",
                      args: { pipeline_id: 117, branch: "main" },
                      description: "Trigger Azure Pipeline #117 on main.",
                      workflow: { kind: "ci", phase: "pipeline_trigger", branch: "main", message: "Pipeline #117" },
                    },
                  },
                },
          tools: [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/#/pipelines");

    // The discovered row appears and its controls route as explicit CI workflow actions.
    await expect(page.getByText("ClaimBot_API").first()).toBeVisible();
    await page.getByRole("button", { name: "Inspect runs" }).first().click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({
      action: "inspect_pipeline",
      repoPath: claimBotPipelineProfile.repoPath,
      projectLink: {
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "117",
        adoPipelineName: "ClaimBot_API",
      },
    });

    await page.getByRole("button", { name: "Trigger pipeline" }).first().click();
    await expect.poll(() => workflowPayloads.length).toBe(2);
    expect(workflowPayloads[1]).toMatchObject({
      action: "trigger_pipeline",
      projectLink: { adoProject: "TeBS-ClaimBot", adoRepoName: "ClaimBot_API" },
    });
    await expect(page.getByText("Approval required")).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("@smoke @mocked keeps pipeline controls usable when the active Project Link has no pipeline ID", async ({ page }) => {
    const noPipelineProfile = {
      ...profile,
      id: "pw-profile-no-pipeline",
      name: "CICD-agents link without pipeline",
      adoPipelineId: "",
      adoPipelineName: "",
    };
    const workflowPayloads: Array<Record<string, unknown>> = [];

    await page.unroute("http://127.0.0.1:8787/project-links");
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([noPipelineProfile]),
      });
    });
    await page.addInitScript((seedProfile) => {
      localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([seedProfile]));
      localStorage.setItem("mergepilot_active_project_link_id", seedProfile.id);
      localStorage.setItem("chat_repo", seedProfile.repoPath);
    }, noPipelineProfile);
    await page.route("http://127.0.0.1:8787/pipeline-connections", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("http://127.0.0.1:8787/project-links/*/pull-requests*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("http://127.0.0.1:8787/project-links/discover", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "internal",
          kind: "pipelines",
          items: [
            {
              id: "117",
              name: "ClaimBot_API",
              description: "CI",
              url: "https://ado/pipelines/117",
            },
          ],
        }),
      });
    });
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
          summary: "Pipeline #117 readiness inspected.",
          workflowState: {
            status: "done",
            workflowKind: "ci",
            workflowPhase: "pipeline_inspected",
            currentStep: "Pipeline #117 readiness inspected",
            completedTools: ["ado_list_pipeline_runs"],
          },
          tools: [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/#/pipelines");

    // A Project Link without a saved pipeline still surfaces the discovered
    // candidates and routes inspection with the explicit discovered ID.
    await expect(page.getByText("ClaimBot_API").first()).toBeVisible();
    await page.getByRole("button", { name: "Inspect runs" }).first().click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({
      action: "inspect_pipeline",
      pipelineId: 117,
      projectLink: {
        adoPipelineId: "",
        adoPipelineName: "",
      },
    });
    await expect(page.getByText(/Inspection completed/)).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("@smoke @mocked renders natural-language read-only PR insight without approval UI", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "read-only-pr-chat-session",
          textId: "read-only-pr-text",
          summary:
            "PR #2655 readiness: reviewable. 16 changed file(s), 0 failed/canceled build(s), 0 failed policy evaluation(s).",
          workflowState: {
            status: "done",
            workflowKind: "pr",
            workflowPhase: "inspected",
            currentStep: "PR #2655 insight inspected",
            completedTools: [
              "ado_get_pull_request_by_id",
              "ado_list_pull_request_threads",
              "ado_get_pull_request_changes",
              "ado_pipelines_get_builds",
              "ado_list_pull_request_work_items",
              "ado_list_pull_request_policy_evaluations",
            ],
          },
          tools: [
            {
              id: "pr-detail-2655",
              name: "ado_get_pull_request_by_id",
              input: { pullRequestId: 2655 },
              output: { stdout: "{\"pullRequestId\":2655}", stderr: "", returncode: 0 },
            },
            {
              id: "pr-changes-2655",
              name: "ado_get_pull_request_changes",
              input: { pullRequestId: 2655 },
              output: { stdout: "{\"fileCount\":16}", stderr: "", returncode: 0 },
            },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill(
      "Analyze PR 2655 for this repo. Read-only only. Do not modify anything or request approval.",
    );
    await page.getByLabel("Send message").click();

    await expect.poll(() => chatPayloads.length).toBe(1);
    expect(chatPayloads[0]).toMatchObject({
      message: "Analyze PR 2655 for this repo. Read-only only. Do not modify anything or request approval.",
      repoPath: profile.repoPath,
      projectLinkId: profile.id,
    });
    console.log("PROBE count:", await page.locator('[data-action-kind="workspace_action"]').count());
    await expect(page.getByText("PR #2655 readiness: reviewable").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Worked/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Approval required")).toHaveCount(0);
    await expect(page.getByText("Approve this command?")).toHaveCount(0);
    await expect(page.getByText("ado_get_build_timeline")).toHaveCount(0);
    const visibleTranscript = await page.locator("main").innerText();
    const quality = evaluateAiInsightAnswer(visibleTranscript, {
      requiredFiles: [],
      requiredEvidence: [
        "PR #2655",
        "16 changed file(s)",
        "0 failed/canceled build(s)",
        "0 failed policy evaluation(s)",
      ],
      requiredCategories: ["deployment"],
      reviewOnly: true,
    });
    expect(quality, JSON.stringify(quality.checks, null, 2)).toMatchObject({
      passed: true,
    });
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("@smoke @mocked renders natural-language read-only pipeline inspection without trigger approval", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "read-only-pipeline-chat-session",
          textId: "read-only-pipeline-text",
          summary:
            "Pipeline #117 latest run #4665 failed in VSBuild because images\\Gojek\\.DS_Store was referenced but missing.",
          workflowState: {
            status: "done",
            workflowKind: "ci",
            workflowPhase: "pipeline_inspected",
            currentStep: "Pipeline #117 readiness inspected",
            completedTools: [
              "ado_list_pipeline_runs",
              "ado_get_build_timeline",
              "ado_get_build_log_excerpt",
            ],
          },
          tools: [
            {
              id: "pipeline-runs-117",
              name: "ado_list_pipeline_runs",
              input: { pipelineId: 117 },
              output: { stdout: "{\"pipelineId\":117}", stderr: "", returncode: 0 },
            },
            {
              id: "pipeline-timeline-4665",
              name: "ado_get_build_timeline",
              input: { buildId: 4665 },
              output: { stdout: "{\"failedRecords\":[{\"name\":\"VSBuild\"}]}", stderr: "", returncode: 0 },
            },
            {
              id: "pipeline-log-4665",
              name: "ado_get_build_log_excerpt",
              input: { buildId: 4665 },
              output: { stdout: "images\\Gojek\\.DS_Store failed", stderr: "", returncode: 0 },
            },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill(
      "Inspect pipeline 117 and summarize recent failed run evidence. Read-only only. Do not queue or rerun anything.",
    );
    await page.getByLabel("Send message").click();

    await expect.poll(() => chatPayloads.length).toBe(1);
    expect(chatPayloads[0]).toMatchObject({
      message:
        "Inspect pipeline 117 and summarize recent failed run evidence. Read-only only. Do not queue or rerun anything.",
      repoPath: profile.repoPath,
      projectLinkId: profile.id,
    });
    await expect(page.getByText("Pipeline #117 latest run #4665 failed").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Worked/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Approval required")).toHaveCount(0);
    await expect(page.getByText("Approve this command?")).toHaveCount(0);
    await expect(page.getByText("ado_trigger_pipeline")).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders natural-language local Git branch inspection without fetch approval", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "read-only-local-branch-session",
          textId: "read-only-local-branch-text",
          summary:
            "Current branch: main. Working tree is clean. Remote refs were not fetched for this read-only local check.",
          workflowState: {
            status: "done",
            workflowKind: "git",
            workflowPhase: "refresh_branch",
            currentStep: "refresh_branch complete",
            completedTools: ["git_current_branch", "git_branch_list", "git_status", "git_remote"],
          },
          tools: [
            {
              id: "local-branch-current",
              name: "git_current_branch",
              input: { command: "git branch --show-current" },
              output: { stdout: "main\n", stderr: "", returncode: 0 },
            },
            {
              id: "local-branch-status",
              name: "git_status",
              input: { command: "git status --porcelain=v1 -b" },
              output: { stdout: "## main\n", stderr: "", returncode: 0 },
            },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill(
      "What's on this branch? Reply briefly. Do not fetch or modify files.",
    );
    await page.getByLabel("Send message").click();

    await expect.poll(() => chatPayloads.length).toBe(1);
    expect(chatPayloads[0]).toMatchObject({
      message: "What's on this branch? Reply briefly. Do not fetch or modify files.",
      repoPath: profile.repoPath,
      projectLinkId: profile.id,
    });
    await expect(page.getByText("Current branch: main")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Worked/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Approval required")).toHaveCount(0);
    await expect(page.getByText("Approve this command?")).toHaveCount(0);
    await expect(page.getByText("git_fetch")).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders natural-language local Git change review without write approval", async ({ page }) => {
    const chatPayloads: Array<Record<string, unknown>> = [];
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      chatPayloads.push(await route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "read-only-local-changes-session",
          textId: "read-only-local-changes-text",
          summary:
            "Reviewed local changes only. README.md is modified; no staging, commit, push, or fetch action was requested.",
          workflowState: {
            status: "done",
            workflowKind: "git",
            workflowPhase: "inspect_changes",
            currentStep: "inspect_changes complete",
            completedTools: ["git_status", "git_dir", "git_diff", "git_diff_name_only"],
          },
          tools: [
            {
              id: "local-changes-status",
              name: "git_status",
              input: { command: "git status --porcelain=v1 -b" },
              output: { stdout: "## main\n M README.md\n", stderr: "", returncode: 0 },
            },
            {
              id: "local-changes-diff",
              name: "git_diff",
              input: { command: "git diff --stat" },
              output: { stdout: " README.md | 1 +\n", stderr: "", returncode: 0 },
            },
            {
              id: "local-changes-names",
              name: "git_diff_name_only",
              input: { command: "git diff --name-only" },
              output: { stdout: "README.md\n", stderr: "", returncode: 0 },
            },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill(
      "Review my changes. Do not stage, commit, push, or fetch remote state.",
    );
    await page.getByLabel("Send message").click();

    await expect.poll(() => chatPayloads.length).toBe(1);
    expect(chatPayloads[0]).toMatchObject({
      message: "Review my changes. Do not stage, commit, push, or fetch remote state.",
      repoPath: profile.repoPath,
      projectLinkId: profile.id,
    });
    await expect(page.getByText("Reviewed local changes only")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Worked/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Approval required")).toHaveCount(0);
    await expect(page.getByText("Approve this command?")).toHaveCount(0);
    await expect(page.getByText("git_fetch")).toHaveCount(0);
    await expect(page.getByText("git_add")).toHaveCount(0);
    await expect(page.getByText("git_commit")).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows the pending approval state and disables composer controls", async ({ page }) => {
    await seedPendingApprovalDraft(page);
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    // The restored pending approval surfaces as the locked composer: the
    // legacy tool bubbles and their attached approval card are no longer
    // replayed in the transcript, and there is no approval notice button.
    await expect(page.getByText("Approval required")).toHaveCount(0);
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
    await openPinnedSummary(page);

    const transcriptColumn = page.locator(".middle-panel-inner");
    const environmentCard = page.locator(".pointer-events-auto.rounded-2xl").filter({ hasText: "Environment" }).first();
    const approvalCard = page.locator('[data-testid="pending-action-card"]');

    await expect(page.getByText("Review my changes and stage the safe files")).toBeVisible();
    // The pending state is the restored approval card plus a locked composer
    // (the old "Waiting for approval N commands" notice button is gone).
    await expect(page.getByPlaceholder(/Approve or cancel the pending action/)).toBeDisabled();
    await expect(page.getByText("The diff is focused on local API wiring")).toBeVisible();
    await expect(page.getByText("git add -- src/app.ts src/api.ts")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and run" })).toBeVisible();
    await expect(environmentCard).toBeVisible();
    await expect(page.getByTitle("Context manages the Project Link")).toHaveText(profile.name);
    await expect(page.getByLabel("Pinned Summary Project Link")).toHaveCount(0);
    await expect(transcriptColumn).toBeVisible();
    await expect(approvalCard).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps suggestion replies hidden while a restored workflow is running", async ({ page }) => {
    await seedRunningWorkflowDraft(page);
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    await expect(page.getByPlaceholder("MergePilot is thinking...")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await expect(page.getByRole("button", { name: "Draft commit message" })).toHaveCount(0);
    await expect(page.getByText("Queued follow-up:")).toHaveCount(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from Git workflow follow-up chips without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Prepare a push approval after checking branch readiness.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the review stage follow-up chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Stage only the files that belong to the reviewed change scope.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the staged diff follow-up chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Show the staged diff and summarize commit risk.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the draft commit message follow-up chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Generate a commit message from the staged changes.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the change-scope follow-up chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Explain what is included in this commit.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the remote-target follow-up chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Show the remote branch target and push command.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the pushed-commit summary follow-up chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Summarize the commit and push that just completed.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the validation failure follow-up chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Analyze the latest validation failure report and suggest the smallest safe fix or rerun.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("fills the composer from the PR validation recovery chip without hidden actions", async ({ page }) => {
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

    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Analyze validation failure context together with PR readiness, policy, and linked work items.",
    );
    expect(workflowPayloads).toHaveLength(0);
    expect(chatRequestCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows right-panel PR readiness step states during an active workflow", async ({ page }) => {
    await seedRunningPrReadinessWorkflowDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");
    await openPinnedSummary(page);
    await page.getByLabel("Workspace summary").getByText("Progress").click();

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

  test("renders tool lifecycle from the canonical timeline without legacy tool events", async ({
    page,
  }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "ui-stream-session",
          textId: "text-1",
          summary: "I checked streamed tool output.",
          workflowState: {},
          tools: [
            {
              id: "call_status_1",
              name: "git_status",
              input: { command: "git status --short -b" },
              output: "## main\n M src/app.ts\n",
              summary: "1 modified file",
            },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Run a streamed status check");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("I checked streamed tool output.")).toHaveCount(1);
    await page.getByRole("button", { name: /^Worked/ }).click();
    await page.getByRole("button", { name: "Ran commands" }).click();
    await expect(page.getByRole("button", { name: /^Ran git status/ })).toBeVisible();
    await page.getByRole("button", { name: /^Ran git status/ }).click();
    await expect(page.getByText("M src/app.ts")).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("deduplicates legacy text and tool events around the canonical timeline", async ({
    page,
  }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      const now = Date.now();
      const sequence = { value: 0 };
      const next = () => ({ sequence: sequence.value++, emittedAt: now });
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "turn.started", data: { type: "turn.started", turnId: "mixed-turn", clientTurnId: undefined, ...next() } },
          { event: "session", data: { sessionId: "mixed-ui-legacy-stream-session" } },
          { event: "turn.narrative.delta", data: { type: "turn.narrative.delta", turnId: "mixed-turn", blockId: "mixed-text", delta: "Canonical status answer.", ...next() } },
          // Legacy live-render events are dropped by the canonical dispatcher;
          // they must never render a second transcript beside the timeline.
          { event: "assistant_delta", data: { type: "assistant_delta", delta: "Legacy duplicate assistant delta." } },
          { event: "message", data: { type: "message", text: "Legacy final duplicate message." } },
          { event: "tool_start", data: { type: "tool_start", name: "git_status", args: { short: true } } },
          { event: "tool_output_delta", data: { type: "tool_output_delta", name: "git_status", stream: "stdout", delta: "legacy duplicate tool output" } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "tool-output-available", toolCallId: "call_status_mixed", toolName: "git_status", output: { stdout: "## main\n M src/app.ts\n", stderr: "", returncode: 0 }, summary: "canonical status summary" } } },
          { event: "turn.tool.started", data: { type: "turn.tool.started", turnId: "mixed-turn", groupId: "mixed-group", commandId: "call_status_mixed", name: "git_status", args: { command: "git status --short -b" }, ...next() } },
          { event: "turn.tool.completed", data: { type: "turn.tool.completed", turnId: "mixed-turn", groupId: "mixed-group", commandId: "call_status_mixed", name: "git_status", ok: true, summary: "canonical status summary", output: "## main\n M src/app.ts\n", ...next() } },
          { event: "turn.execution.completed", data: { type: "turn.execution.completed", turnId: "mixed-turn", elapsedMs: 1, ...next() } },
          { event: "turn.final.delta", data: { type: "turn.final.delta", turnId: "mixed-turn", delta: "Canonical status answer.", ...next() } },
          { event: "turn.final.completed", data: { type: "turn.final.completed", turnId: "mixed-turn", finalText: "Canonical status answer.", ...next() } },
          { event: "turn.finished", data: { type: "turn.finished", turnId: "mixed-turn", status: "completed", ...next() } },
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
    await expect(page.getByRole("button", { name: /^Worked/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask (MergePilot|MergePilot)/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders approval cards from canonical timeline events without legacy approval events", async ({
    page,
  }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      const now = Date.now();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "turn.started", data: { type: "turn.started", turnId: "approval-turn", sequence: 0, emittedAt: now } },
          { event: "session", data: { sessionId: "canonical-approval-session" } },
          {
            event: "turn.approval.requested",
            data: {
              type: "turn.approval.requested",
              turnId: "approval-turn",
              sequence: 1,
              emittedAt: now,
              blockId: "approval-git-add",
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
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask (MergePilot|MergePilot)/).fill("Prepare a staged commit");
    await page.getByRole("button", { name: /Send/ }).click();

    await expect(page.getByText("Approval required")).toBeVisible();
    await expect(page.getByText("git add -- apps/desktop/src/pages/Chat.tsx")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip action" })).toBeVisible();
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

    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "long-ui-stream-session",
          textId: "long-text",
          summary: longMarkdown,
          workflowState: {},
          tools: [
            {
              id: "call_diff_1",
              name: "git_diff",
              input: { command: "git diff -- apps/desktop/src/pages/Chat.tsx" },
              output:
                "diff --git a/apps/desktop/src/pages/Chat.tsx b/apps/desktop/src/pages/Chat.tsx\n+streamed markdown keeps references attached\n",
              summary: "diff inspected",
            },
          ],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Stream a long review with sources");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Review Plan" })).toHaveCount(1);
    await expect(page.getByText("Step 18: preserve context")).toBeVisible();
    await page.getByRole("button", { name: /^Worked/ }).click();
    await page.getByRole("button", { name: "Ran commands" }).click();
    await expect(page.getByRole("button", { name: /^Ran git diff/ })).toBeVisible();
    await page.getByRole("button", { name: /^Ran git diff/ }).click();
    await expect(page.getByText("streamed markdown keeps references attached")).toBeVisible();
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
        body: workflowChatSse({
          sessionId: "scroll-preservation-session",
          textId: "scroll-text",
          summary: "Answer that should not yank scroll.",
          workflowState: {},
          tools: [],
        }),
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

  test("renders sanitized chat history titles after approved actions", async ({ page }) => {
    await page.unroute("http://127.0.0.1:8787/chat/history");
    await page.route("http://127.0.0.1:8787/chat/history", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            sessionId: "confirmed-action-history",
            title: "Stage selected README changes",
            preview: "Stage selected README changes",
            createdAt: 1783190000,
            updatedAt: 1783190100,
            pinned: false,
          },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByTitle("Expand history").click();

    await expect(page.getByText("History", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open chat Stage selected README changes" })).toBeVisible();
    await expect(page.getByText(/confirmed & executed/)).toHaveCount(0);
    await expect(page.getByText(/git_add/)).toHaveCount(0);
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

  test("releases the composer after a canonical timeline finish", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: workflowChatSse({
          sessionId: "ui-stream-only-finish-session",
          textId: "text-1",
          summary: "Standalone UI stream completed.",
          workflowState: {},
          tools: [],
        }),
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

  test("deduplicates legacy and canonical stream error events", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      const now = Date.now();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "turn.started", data: { type: "turn.started", turnId: "error-turn", sequence: 0, emittedAt: now } },
          { event: "session", data: { sessionId: "error-ui-stream-session" } },
          { event: "turn.narrative.delta", data: { type: "turn.narrative.delta", turnId: "error-turn", sequence: 1, emittedAt: now, blockId: "text-1", delta: "Partial answer before failure." } },
          // Legacy error events are dropped by the canonical dispatcher; the
          // failure summary must surface exactly once as the final text.
          { event: "error", data: { type: "error", message: "Stream failed while reading tool output." } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "error", errorText: "Stream failed while reading tool output." } } },
          { event: "turn.execution.completed", data: { type: "turn.execution.completed", turnId: "error-turn", sequence: 2, emittedAt: now, elapsedMs: 1 } },
          { event: "turn.final.delta", data: { type: "turn.final.delta", turnId: "error-turn", sequence: 3, emittedAt: now, delta: "Stream failed while reading tool output." } },
          { event: "turn.final.completed", data: { type: "turn.final.completed", turnId: "error-turn", sequence: 4, emittedAt: now, finalText: "Stream failed while reading tool output." } },
          { event: "turn.failed", data: { type: "turn.failed", turnId: "error-turn", sequence: 5, emittedAt: now, status: "failed", message: "Stream failed while reading tool output." } },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask MergePilot/).fill("Trigger a duplicated stream error");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Stream failed while reading tool output.")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeHidden();
    await page.getByRole("button", { name: /^Stopped/ }).click();
    await expect(page.getByText("Partial answer before failure.")).toBeVisible();
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
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Render diagram" }).click();
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
    await page.getByRole("button", { name: "Render diagram" }).click();
    await expect(page.getByText("Mermaid render failed")).toBeVisible();
    await expect(page.getByText("flowchart TD")).toBeVisible();
    await expect(page.locator("pre").filter({ hasText: "A -->" })).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("@smoke @mocked renders project-context source references in the conversation", async ({ page }) => {
    await seedSourceReferenceDraft(page);
    const previewRequests = await mockWorkspaceFilePreview(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(page.getByText("Explain this project architecture")).toBeVisible();
    await expect(page.getByText("apps/desktop/src/pages/Chat.tsx")).toBeVisible();
    await expect(page.getByText("packages/core/src/chatContext.ts")).toBeVisible();
    await expect(page.getByRole("button", { name: /chatContext(\.ts)?/ })).toBeVisible();
    const visibleTranscript = await page.locator("main").innerText();
    const quality = evaluateAiInsightAnswer(visibleTranscript, {
      requiredFiles: [
        "apps/desktop/src/pages/Chat.tsx",
        "packages/core/src/chatContext.ts",
      ],
      requiredEvidence: ["desktop UI", "repository grounding"],
      requiredCategories: [],
      reviewOnly: true,
    });
    expect(quality, JSON.stringify(quality.checks, null, 2)).toMatchObject({
      passed: true,
    });

    const expandCodePanel = page.getByTitle("Expand code panel");
    if (await expandCodePanel.count()) await expandCodePanel.click();
    const hideSummary = page.getByTitle("Hide pinned summary");
    if (await hideSummary.count()) await hideSummary.click();
    const rightPanel = page.locator(".right-panel");
    await expectRightShellSplitStartsAtTop(page);
    await expectSummaryToggleNearRightSplit(page);
    await expect(rightPanel.getByText("No file selected")).toBeVisible();
    await expect(rightPanel.getByText("Select a reference.")).toHaveCount(0);
    await expect(rightPanel.getByRole("button", { name: /Chat\.tsx/ })).toHaveCount(0);
    await expect(rightPanel.locator('button[aria-pressed="true"]').filter({ hasText: "chatContext.ts" })).toHaveCount(0);

    await page.getByRole("button", { name: /chatContext(\.ts)?/ }).click();

    await expect.poll(() =>
      previewRequests.some((request) =>
        request.repoPath === profile.repoPath &&
        request.filePath === "packages/core/src/chatContext.ts",
      ),
    ).toBe(true);
    expect(previewRequests.some((request) => request.filePath === "apps/desktop/src/pages/Chat.tsx")).toBe(false);
    await expect(rightPanel.locator('button[aria-pressed="true"]').filter({ hasText: "chatContext.ts" })).toHaveCount(1);
    await expect(rightPanel.locator('button[aria-pressed="true"]').filter({ hasText: "TS" })).toHaveCount(1);
    await expect(rightPanel.getByRole("button", { name: /Chat\.tsx/ })).toHaveCount(0);
    await expect(rightPanel.getByText("300 lines")).toBeVisible();
    await expect(rightPanel.getByText("line 291")).toBeVisible();
    const activeSourceTabBox = await rightPanel
      .locator('button[aria-pressed="true"]')
      .filter({ hasText: "chatContext.ts" })
      .boundingBox();
    const rightPanelBox = await rightPanel.boundingBox();
    expect(activeSourceTabBox).not.toBeNull();
    expect(rightPanelBox).not.toBeNull();
    expect((activeSourceTabBox?.right ?? 0)).toBeLessThanOrEqual((rightPanelBox?.right ?? 0) + 1);
    await expect(rightPanel.locator(".cm-gutters")).toBeVisible();
    await expect(rightPanel.locator(".cm-lineNumbers .cm-gutterElement").filter({ hasText: "291" })).toBeVisible();
    await expect(rightPanel.locator(".cm-sourceTargetLine")).toContainText("previewLine291");
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("@smoke @mocked turns the code panel into an overlay when the chat workspace becomes narrow", async ({ page }) => {
    await seedSourceReferenceDraft(page);
    await mockWorkspaceFilePreview(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    const expandCodePanel = page.getByTitle("Expand code panel");
    if (await expandCodePanel.count()) await expandCodePanel.click();
    const hideSummary = page.getByTitle("Hide pinned summary");
    if (await hideSummary.count()) await hideSummary.click();

    const rightPanel = page.locator(".right-panel");
    await page.getByRole("button", { name: /chatContext(\.ts)?/ }).click();
    await expect(rightPanel.getByText("300 lines")).toBeVisible();

    await page.setViewportSize({ width: 700, height: 820 });

    await expect.poll(async () => {
      const width = await rightPanel.evaluate((element) => element.getBoundingClientRect().width);
      return Math.round(width);
    }).toBeGreaterThan(0);
    await expect(rightPanel).toHaveClass(/right-panel--overlay/);
    await expect(page.getByTitle("Collapse code panel")).toBeVisible();
    await expect(rightPanel.getByText("300 lines")).toBeVisible();
    await expect(page.getByTestId("chat-message-panel")).toBeVisible();
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
    const hideSummary = page.getByTitle("Hide pinned summary");
    if (await hideSummary.count()) await hideSummary.click();
    const rightPanel = page.locator(".right-panel");
    await page.getByRole("button", { name: /chatContext(\.ts)?/ }).click();

    await expect(rightPanel.getByText("300 lines")).toBeVisible();
    await rightPanel.getByRole("button", { name: "Path" }).click();
    await expect(rightPanel.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("packages/core/src/chatContext.ts");

    await rightPanel.getByRole("button", { name: "Copy" }).click();
    await expect(rightPanel.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("previewLine291");

    await rightPanel.getByRole("button", { name: "Close chatContext.ts" }).click();
    await expect(rightPanel.getByText("No file selected")).toBeVisible();
    await expect(rightPanel.getByRole("button", { name: /chatContext\.ts/ })).toHaveCount(0);

    await page.getByRole("button", { name: /chatContext(\.ts)?/ }).click();
    await expect(rightPanel.getByRole("button", { name: "chatContext.ts", exact: true })).toBeVisible();
    await rightPanel.getByRole("button", { name: "Close all files" }).click();
    await expect(rightPanel.getByText("No file selected")).toBeVisible();
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
    await expect(readinessActions.filter({ hasText: "Check PR risks" })).toBeVisible();
    await expect(readinessActions.filter({ hasText: "Rerun validation" })).toBeVisible();
    await expect(readinessActions.filter({ hasText: "Check policy" })).toBeVisible();
    // The derived PR follow-up set no longer includes a work-items action.
    await expect(readinessActions.filter({ hasText: "List work items" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open workspace" }).click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading saved PR insight artifact...")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved PR insight review" })).toBeVisible();
    await expect(
      page.getByText("Persisted review says the PR needs one human check before merge."),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "Repository" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "CICD-agents" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Pull request" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "#42" })).toBeVisible();
    await expect(page.getByText("Policy status should be checked before merge.")).toBeVisible();
    await expect(page.getByText("Failed policies: 1")).toBeVisible();
    await expect(page.getByText("Work items: 1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build blockers" })).toBeVisible();
    await expect(page.getByText("#77 20260610.1 CI: failed (https://ado/build/77)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Policy blockers" })).toBeVisible();
    await expect(
      page.getByText("Minimum reviewers: failed (blocking)", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active threads" })).toBeVisible();
    await expect(page.getByText("#5 Ada: Needs tests")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked work items" })).toBeVisible();
    await expect(
      page.getByText("#123 User Story [Active]: Improve agent insight (https://ado/workItems/123)"),
    ).toBeVisible();
    await readinessActions.filter({ hasText: "Rerun validation" }).click();
    // Suggestion chips are composer prompts, not hidden workflow executions:
    // the click fills the composer and never fires a workflow-action request.
    await expect(page.getByPlaceholder(/Ask MergePilot/)).toHaveValue(
      "Rerun relevant validation after reviewing saved PR readiness blockers.",
    );
    expect(workflowPayloads).toHaveLength(0);
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows persisted PR insight lookup errors in the result workspace", async ({ page }) => {
    await seedSavedPrInsightSourceDraft(page);
    // The composer no longer switches Project Links; simulate "no active link"
    // the way Context would after the last Project Link is removed. With zero
    // links the auto-resolve cannot re-select one, and the restored draft must
    // not re-activate the old link either.
    await page.route("http://127.0.0.1:8787/project-links", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.addInitScript(() => {
      localStorage.setItem("mergepilot_project_links_v1", JSON.stringify([]));
      localStorage.removeItem("mergepilot_active_project_link_id");
      const raw = sessionStorage.getItem("dev_agent_chat_draft_v1");
      if (raw) {
        const draft = JSON.parse(raw) as {
          activeProfileId?: string | null;
          activeProjectLinkId?: string | null;
        };
        draft.activeProfileId = null;
        draft.activeProjectLinkId = null;
        sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify(draft));
      }
    });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await page.getByRole("button", { name: "Open workspace" }).click();

    await expect(page.getByText("Saved artifact unavailable")).toBeVisible();
    await expect(page.getByText("Select a Project Link before loading saved PR insight artifacts.")).toBeVisible();
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
