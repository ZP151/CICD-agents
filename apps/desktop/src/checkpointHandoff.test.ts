import { describe, expect, it } from "vitest";
import {
  ACTIVITY_HANDOFF_KEY,
  CHAT_HANDOFF_KEY,
  PULL_REQUESTS_HANDOFF_KEY,
  buildActivityPrInsightHandoffDraft,
  buildCheckpointRollbackHandoffDraft,
  buildPullRequestsPrHandoffDraft,
  buildPrInsightChatHandoffDraft,
} from "./checkpointHandoff";

describe("checkpoint rollback chat handoff", () => {
  it("uses a stable storage key shared by Activity and Chat", () => {
    expect(CHAT_HANDOFF_KEY).toBe("dev_agent_chat_handoff_v1");
    expect(ACTIVITY_HANDOFF_KEY).toBe("dev_agent_activity_handoff_v1");
    expect(PULL_REQUESTS_HANDOFF_KEY).toBe("dev_agent_pull_requests_handoff_v1");
  });

  it("preserves the exact rollback proposal in the chat draft", () => {
    const draft = buildCheckpointRollbackHandoffDraft({
      checkpointId: "git-20260611-abcdef",
      repoPath: "C:\\work\\repo",
      profileId: "profile-1",
      proposal: {
        tool: "git_checkpoint_apply",
        args: {
          checkpointId: "git-20260611-abcdef",
          maxFiles: 20,
        },
        description: "Restore tracked files to checkpoint git-20260611-abcdef.",
        nextHint: "Review the approval card before confirming.",
      },
    });

    expect(draft).toMatchObject({
      repoPath: "C:\\work\\repo",
      profileId: "profile-1",
      source: "activity-checkpoint-rollback",
    });
    expect(draft.message).toContain("Tool: git_checkpoint_apply");
    expect(draft.message).toContain("Args: {\"checkpointId\":\"git-20260611-abcdef\",\"maxFiles\":20}");
    expect(draft.message).toContain("Description: Restore tracked files to checkpoint git-20260611-abcdef.");
    expect(draft.message).toContain("Next hint: Review the approval card before confirming.");
    expect(draft.message).toContain("Checkpoint: git-20260611-abcdef");
    expect(draft.message).toContain("Repository: C:\\work\\repo");
    expect(draft.message).toContain("Do not execute it until I approve.");
  });

  it("builds a PR insight chat draft that reuses saved AI conclusions", () => {
    const draft = buildPrInsightChatHandoffDraft({
      pullRequestId: 42,
      title: "Improve pipeline checks",
      repository: "demo-repo",
      repoPath: "C:\\work\\repo",
      profileId: "profile-1",
      kind: "review_run",
    });

    expect(draft).toMatchObject({
      repoPath: "C:\\work\\repo",
      profileId: "profile-1",
      source: "pull-requests-pr-insight",
    });
    expect(draft.message).toContain("Use the saved AI insight for PR #42.");
    expect(draft.message).toContain("Do not rerun Azure DevOps or LLM analysis unless I explicitly ask for a fresh result.");
    expect(draft.message).toContain("Repository: demo-repo");
    expect(draft.message).toContain("Title: Improve pipeline checks");
    expect(draft.message).toContain("Saved insight type: full review");
  });

  it("builds an Activity handoff draft for a saved PR insight artifact", () => {
    expect(buildActivityPrInsightHandoffDraft({
      artifactId: "profile-1/demo-repo/42/review_run/2026-06-11T00%3A10%3A00.000Z",
      profileId: "profile-1",
    })).toEqual({
      kind: "pr_insight",
      artifactId: "profile-1/demo-repo/42/review_run/2026-06-11T00%3A10%3A00.000Z",
      profileId: "profile-1",
    });
  });

  it("builds a Pull Requests handoff draft for returning to the operational PR workspace", () => {
    expect(buildPullRequestsPrHandoffDraft({
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      artifactId: "artifact-42",
    })).toEqual({
      kind: "pr",
      profileId: "profile-1",
      repository: "demo-repo",
      pullRequestId: 42,
      artifactId: "artifact-42",
    });
  });
});
