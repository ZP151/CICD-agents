import { readFile } from "node:fs/promises";
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
  adoPipelineId: "",
  adoPipelineName: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  templateProfile: "",
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
        cloudProfileStore: false,
        cloudSecrets: false,
        cloudSessions: false,
      }),
    });
  });

  await page.route("http://127.0.0.1:8787/profiles", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([profile]) });
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

  await page.route(/http:\/\/127\.0\.0\.1:8787\/profiles\/[^/]+\/pr-insights\/artifact\?.*/, async (route) => {
    const url = new URL(route.request().url());
    const artifactId = url.searchParams.get("artifactId") ?? "";
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: {
          id: artifactId,
          profileId: profile.id,
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
            buildBlockers: [{
              id: 77,
              buildNumber: "20260610.1",
              definitionName: "CI",
              status: "completed",
              result: "failed",
              url: "https://ado/build/77",
            }],
            policyBlockers: [{
              id: "policy-1",
              name: "Minimum reviewers",
              typeName: "Reviewer policy",
              status: "failed",
              isBlocking: true,
            }],
            activeThreads: [{
              id: 5,
              status: 1,
              author: "Ada",
              firstComment: "Needs tests",
            }],
            linkedWorkItems: [],
          },
          findingCount: 1,
          discardedFindingCount: 0,
          tokensIn: 1200,
          tokensOut: 340,
        },
      }),
    });
  });

  await page.addInitScript((seedProfile) => {
    localStorage.setItem("cicd_agent_profiles_v1", JSON.stringify([seedProfile]));
    localStorage.setItem("cicd_agent_active_project_link_id", seedProfile.id);
    localStorage.setItem("chat_profile_id", seedProfile.id);
    localStorage.setItem("chat_repo", seedProfile.repoPath);
    localStorage.setItem("dev_agent_active_model", "built_in");
  }, profile);
}

async function expectNoVisibleHorizontalOverflow(page: Page): Promise<void> {
  let overflow: Array<{ tag: string; text: string; left: number; right: number; width: number; className: string }> = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      overflow = await page.evaluate(() => {
        function visible(el: Element): boolean {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          let node: Element | null = el;
          while (node) {
            const style = window.getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.05) {
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
      if (attempt === 1 || !(error instanceof Error) || !/Execution context was destroyed/i.test(error.message)) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded");
    }
  }

  expect(overflow).toEqual([]);
}

function sse(events: Array<{ event: string; data: unknown }>): string {
  return events
    .map((entry) => `event: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`)
    .join("");
}

async function seedPendingApprovalDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
    }));
  }, profile);
}

async function seedRunningWorkflowDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
    }));
  }, profile);
}

async function seedInterruptedStreamingDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
    }));
  }, profile);
}

async function seedLongHistoryDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    const bubbles = Array.from({ length: 36 }, (_, index) => ({
      id: `history-${index + 1}`,
      kind: index % 2 === 0 ? "user" : "assistant",
      text: `History item ${index + 1}\n${"Repository context and review notes. ".repeat(6)}`,
    }));
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
      repoPath: seedProfile.repoPath,
      input: "",
      bubbles,
      sessionId: "long-history-session",
      statusText: null,
      workflowState: null,
      customTitle: "Long history",
      activeProfileId: seedProfile.id,
    }));
  }, profile);
}

async function seedArtifactDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
              content: "flowchart TD\n  UI[Desktop chat] --> Agent[Dev Agent]\n  Agent --> ADO[Azure DevOps]",
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
    }));
  }, profile);
}

async function seedSavedPrInsightSourceDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
    }));
  }, profile);
}

async function seedUnbackedArtifactDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
    }));
  }, profile);
}

async function seedInvalidMermaidArtifactDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
    }));
  }, profile);
}

async function seedSourceReferenceDraft(page: Page): Promise<void> {
  await page.addInitScript((seedProfile) => {
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
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
                snippet: "chatContextSources emits source_document metadata for repository context.",
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
    }));
  }, profile);
}

test.describe("Chat layout", () => {
  test.beforeEach(async ({ page }) => {
    await mockRuntime(page);
  });

  test("keeps the project-linked chat shell inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await expect(page.getByText("Ask Dev Agent anything")).toBeVisible();
    await expect(page.getByTitle("Conversation model")).toContainText("Built-in model");
    await expectNoVisibleHorizontalOverflow(page);

    await page.getByTitle("Expand context panel").click();
    await expect(page.getByText("Environment")).toBeVisible();
    await expect(page.getByText("Commit or push")).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);

    await page.getByTitle("Conversation model").click();
    await expect(page.getByText("Model", { exact: true })).toBeVisible();
    await expect(page.getByText("Built-in model").last()).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps the onboarding form and input usable on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 836, height: 768 });
    await page.goto("/chat?new=1");

    await expect(page.getByText("Ask Dev Agent anything")).toBeVisible();
    await expect(page.getByPlaceholder(/Ask Dev Agent/)).toBeVisible();
    await page.getByTitle("Conversation model").click();
    await expect(page.getByText("Model", { exact: true })).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("keeps command chips compact and routes structured validation commands", async ({ page }) => {
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
    await expect(page.getByTitle("Inspect pull request insight for the active Azure DevOps context.")).toBeVisible();
    await expect(page.getByTitle("Check Azure DevOps pull request policy status.")).toBeVisible();
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
    await page.getByTitle("Expand context panel").click();

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
          summary: payload.action === "inspect_pr_insight"
            ? "Readiness: blocked. 4 changed file(s), 1 active thread(s), 1 failed/canceled build(s), 2 failed/error policy evaluation(s), 0 linked work item(s). Info: no linked work items were found."
            : `${payload.action} complete for latest active PR`,
          workflowState: {
            status: "done",
            workflowKind: "pr",
            workflowPhase: payload.action === "check_pr_policy" ? "policy_checked" : payload.action === "list_pr_work_items" ? "work_items_listed" : "inspected",
            currentStep: `${payload.action} complete`,
            completedTools: payload.action === "inspect_pr_insight" ? ["ado_get_pull_request_by_id"] : [],
          },
          tools: [],
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");

    await page.getByTitle("Inspect pull request insight for the active Azure DevOps context.").click();
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

  test("queues suggestion replies while a restored workflow is running", async ({ page }) => {
    await seedRunningWorkflowDraft(page);
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto("/chat");

    await expect(page.getByText("Working:")).toBeVisible();
    await expect(page.getByText("Inspecting workspace").first()).toBeVisible();
    await expect(page.getByPlaceholder("Dev Agent is working...")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await page.getByRole("button", { name: "Commit message" }).click();
    await expect(page.getByText("Queued follow-up:")).toBeVisible();
    await expect(page.getByText("Commit message").first()).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Queued follow-up:")).toBeHidden();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders tool lifecycle from UI stream chunks without legacy tool events", async ({ page }) => {
    await page.route("http://127.0.0.1:8787/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "ui-stream-session" } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-delta", id: "text-1", delta: "I checked streamed " } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-delta", id: "text-1", delta: "tool output." } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-end", id: "text-1" } } },
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
              chunk: { type: "tool-input-start", toolCallId: "call_status_1", toolName: "git_status" },
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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } } },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask Dev Agent/).fill("Run a streamed status check");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("I checked streamed tool output.")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /git_status done branch=true/ })).toBeVisible();
    await expect(page.getByText("1 modified file")).toBeVisible();
    await expect(page.getByText("References", { exact: true })).toBeVisible();
    await expect(page.getByText("apps/desktop/src/pages/Chat.tsx:line 3904")).toHaveCount(1);
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
      ".\\scripts\\windows\\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck",
      "```",
      "",
      ...Array.from({ length: 18 }, (_, index) => `- Step ${index + 1}: preserve context, cite evidence, and avoid hidden workflow jumps.`),
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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-start", id: "long-text" } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-delta", id: "long-text", delta: firstChunk } } },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: {
                type: "tool-output-delta",
                toolCallId: "call_diff_1",
                toolName: "git_diff",
                stream: "stdout",
                delta: "diff --git a/apps/desktop/src/pages/Chat.tsx b/apps/desktop/src/pages/Chat.tsx\n",
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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-delta", id: "long-text", delta: secondChunk } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-end", id: "long-text" } } },
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
                  stdout: "diff --git a/apps/desktop/src/pages/Chat.tsx b/apps/desktop/src/pages/Chat.tsx\n+streamed markdown keeps references attached\n",
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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } } },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask Dev Agent/).fill("Stream a long review with sources");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Review Plan" })).toHaveCount(1);
    await expect(page.getByText("Step 18: preserve context")).toBeVisible();
    await expect(page.getByText("diff inspected")).toBeVisible();
    await expect(page.getByRole("button", { name: /git_diff done/ })).toBeVisible();
    await expect(page.getByText("References", { exact: true })).toBeVisible();
    await expect(page.getByText("apps/desktop/src/pages/Chat.tsx:line 3942")).toHaveCount(1);
    await expect(page.getByText("Streaming UI protocol")).toHaveCount(1);
    await expect(page.getByPlaceholder(/Ask Dev Agent/)).toBeEnabled();
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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-start", id: "scroll-text" } } },
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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-end", id: "scroll-text" } } },
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

    await page.getByPlaceholder(/Ask Dev Agent/).fill("Continue while I read earlier context");
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
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "start" } } },
          { event: "session", data: { sessionId: "cancelled-ui-stream-session" } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-delta", id: "text-1", delta: "Late answer after stop." } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-end", id: "text-1" } } },
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
      }).catch(() => undefined);
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask Dev Agent/).fill("Start a cancellable stream");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask Dev Agent/)).toBeEnabled();

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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } } },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "text-1", delta: "Standalone UI stream completed." },
            },
          },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-end", id: "text-1" } } },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "stop" } } },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask Dev Agent/).fill("Run a UI stream only response");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Standalone UI stream completed.")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask Dev Agent/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("restores interrupted streaming drafts as stable completed text", async ({ page }) => {
    await seedInterruptedStreamingDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(page.getByText("Partial architecture answer before the page was reloaded.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask Dev Agent/)).toBeEnabled();
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
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "text-start", id: "text-1" } } },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "text-delta", id: "text-1", delta: "Partial answer before failure." },
            },
          },
          { event: "error", data: { type: "error", message: "Stream failed while reading tool output." } },
          {
            event: "ui.chunk",
            data: {
              type: "ui.chunk",
              chunk: { type: "error", errorText: "Stream failed while reading tool output." },
            },
          },
          { event: "ui.chunk", data: { type: "ui.chunk", chunk: { type: "finish", finishReason: "error" } } },
        ]),
      });
    });

    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat?new=1");
    await page.getByPlaceholder(/Ask Dev Agent/).fill("Trigger a duplicated stream error");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Partial answer before failure.")).toBeVisible();
    await expect(page.getByText("Stream failed while reading tool output.")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
    await expect(page.getByPlaceholder(/Ask Dev Agent/)).toBeEnabled();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("opens the result workspace shell from an artifact card", async ({ page }, testInfo) => {
    await seedArtifactDraft(page);
    await page.context().grantPermissions(["clipboard-write"], { origin: "http://127.0.0.1:1420" });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(page.getByText("Project architecture diagram")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open artifact workspace for Project architecture diagram" })).toBeVisible();
    await page.getByRole("button", { name: "Open artifact workspace for Project architecture diagram" }).click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("artifact-architecture")).toBeVisible();
    await expect(page.getByText("Rendered Mermaid diagram. Source remains available below.")).toBeVisible();
    await expect(page.getByTestId("mermaid-artifact-svg").locator("svg")).toBeVisible();
    await expect(page.getByText("flowchart TD")).toBeVisible();
    await expect(page.getByText("UI[Desktop chat] --> Agent[Dev Agent]")).toBeVisible();
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

    await page.getByRole("button", { name: "Open artifact workspace for PR insight report" }).click();
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

    await page.getByRole("button", { name: "Open artifact workspace for Broken Mermaid diagram" }).click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("Mermaid render failed")).toBeVisible();
    await expect(page.getByText("flowchart TD")).toBeVisible();
    await expect(page.locator("pre").filter({ hasText: "A -->" })).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("renders project-context source references in the conversation", async ({ page }) => {
    await seedSourceReferenceDraft(page);
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await expect(page.getByText("Explain this project architecture")).toBeVisible();
    await expect(page.getByText("The Conversation page coordinates the desktop UI")).toBeVisible();
    await expect(page.getByText("References", { exact: true })).toBeVisible();
    await expect(page.getByText("2 files")).toBeVisible();
    await expect(page.getByText("apps/desktop/src/pages/Chat.tsx (app)")).toBeVisible();
    await expect(page.getByText("apps/desktop/src/pages/Chat.tsx", { exact: true })).toBeVisible();
    await expect(page.getByText("packages/core/src/chatContext.ts:291-350")).toBeVisible();
    await expect(page.getByText("packages/core/src/chatContext.ts:line 291")).toBeVisible();
    await expect(page.getByText("Project structure signal: application workspace.")).toBeVisible();
    await expect(page.getByText("chatContextSources emits source_document metadata")).toBeVisible();
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
    await expect(page.getByText("Persisted review says the PR needs one human check before merge.")).toBeVisible();
    await expect(page.getByText("Policy status should be checked before merge.")).toBeVisible();
    await expect(page.getByText("Failed policies: 1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build blockers" })).toBeVisible();
    await expect(page.getByText("#77 20260610.1 CI: failed (https://ado/build/77)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Policy blockers" })).toBeVisible();
    await expect(page.getByText("Minimum reviewers: failed (blocking)", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active threads" })).toBeVisible();
    await expect(page.getByText("#5 Ada: Needs tests")).toBeVisible();
    await readinessActions.filter({ hasText: "Rerun validation" }).click();
    await expect.poll(() => workflowPayloads.length).toBe(1);
    expect(workflowPayloads[0]).toMatchObject({ action: "run_tests" });
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("shows persisted PR insight lookup errors in the result workspace", async ({ page }) => {
    await seedSavedPrInsightSourceDraft(page);
    await page.route(/http:\/\/127\.0\.0\.1:8787\/profiles\/[^/]+\/pr-insights\/artifact\?.*/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "artifact not found" }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await page.getByRole("button", { name: "Open workspace" }).click();

    await expect(page.getByText("Saved artifact unavailable")).toBeVisible();
    await expect(page.getByText("/profiles/pw-profile/pr-insights/artifact HTTP 404")).toBeVisible();
    await expectNoVisibleHorizontalOverflow(page);
  });

  test("does not look up ordinary artifact shells as PR insight artifacts", async ({ page }) => {
    let lookupCount = 0;
    await seedUnbackedArtifactDraft(page);
    await page.route("http://127.0.0.1:8787/profiles/pw-profile/pr-insights/artifact?artifactId=artifact-unbacked-report", async (route) => {
      lookupCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "ordinary artifacts must not call this route" }),
      });
    });
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/chat");

    await page.getByRole("button", { name: "Open artifact workspace for Unbacked report shell" }).click();

    await expect(page.getByText("Result workspace", { exact: true })).toBeVisible();
    await expect(page.getByText("Markdown report rendering will be added in the next artifact content batch.")).toBeVisible();
    await page.waitForTimeout(250);
    expect(lookupCount).toBe(0);
    await expectNoVisibleHorizontalOverflow(page);
  });
});
