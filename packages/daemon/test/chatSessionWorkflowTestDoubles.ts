import type { ChatPlannerResult } from "@mergepilot/core";

export function plannerResult(response: string): ChatPlannerResult {
  return {
    response,
    riskLevel: "medium",
    actionsTaken: [],
    suggestions: [],
    toolCallsMade: [],
    usedLlm: true,
  };
}
