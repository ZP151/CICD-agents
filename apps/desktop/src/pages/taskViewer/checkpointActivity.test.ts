import { describe, expect, it } from "vitest";
import type { ChatCheckpointActivity } from "../../api.js";
import {
  checkpointActivityDetail,
  compactActivityPath,
} from "./checkpointActivity.js";

const checkpoint: ChatCheckpointActivity = {
  id: "checkpoint-1",
  sessionId: "chat-1",
  repoPath: "C:\\Users\\15492\\AppData\\Local\\Temp\\mergepilot-live-push-j2JDBp\\work",
  projectLinkId: "pl-1",
  at: 1_786_000_000,
  toolName: "git_push_tag",
  toolSummary: "Command completed",
  toolOk: true,
  checkpointId: "git-1",
  checkpointPath: "C:\\Users\\15492\\.mergepilot\\checkpoints\\git-1.json",
};

describe("checkpointActivityDetail", () => {
  it("keeps checkpoint list paths compact while preserving useful context", () => {
    expect(compactActivityPath(checkpoint.repoPath)).toBe("...\\mergepilot-live-push-j2JDBp\\work");
    expect(checkpointActivityDetail(checkpoint)).toBe("...\\mergepilot-live-push-j2JDBp\\work");
  });

  it("keeps checkpoint restore details explicit", () => {
    expect(checkpointActivityDetail({
      ...checkpoint,
      targetCheckpointId: "git-target",
      safetyCheckpointId: "git-safety",
    })).toBe("restored git-target · safety git-safety");
  });
});
