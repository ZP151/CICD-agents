import type { CloudChangedFile } from "./cloudContext.js";
import type { ReviewFinding } from "./reviewPlanner.js";

export interface AutoApprovalPolicy {
  enabled: boolean;
  reviewerId: string;
  maxChangedFiles: number;
  allowedTargetBranches: string[];
  sensitivePathPatterns: string[];
}

export interface ReviewDecision {
  queue: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  riskLevel: "low" | "medium" | "high";
  autoApprove: boolean;
  reason: string;
  reasonCodes: string[];
  contextConfidence: "high" | "medium" | "low";
}

export const DEFAULT_AUTO_APPROVAL_POLICY: AutoApprovalPolicy = {
  enabled: true,
  reviewerId: "",
  maxChangedFiles: 8,
  allowedTargetBranches: ["main"],
  sensitivePathPatterns: [
    ".github/",
    "infra/",
    "deploy/",
    "security/",
    "auth/",
    "migrations/",
  ],
};

export function decideReviewOutcome(args: {
  policy: AutoApprovalPolicy;
  targetBranch: string;
  changedFiles: CloudChangedFile[];
  findings: ReviewFinding[];
  reviewUsedLlm: boolean;
  discardedFindingCount?: number;
  hunkCoverageFiles?: number;
  wholeFileFallbackFiles?: number;
  changedHunkLines?: number;
}): ReviewDecision {
  const contextQuality = classifyContextQuality(args);
  const riskLevel = classifyRisk(args.findings, args.changedFiles, args.policy);
  if (riskLevel === "high") {
    return decision({
      queue: "blocked",
      riskLevel,
      autoApprove: false,
      contextConfidence: contextQuality.confidence,
      reason: "Blocking findings or sensitive changes require a human.",
      reasonCodes: ["risk.high", ...contextQuality.reasonCodes],
    });
  }
  if (riskLevel === "medium") {
    return decision({
      queue: "needs_human_review",
      riskLevel,
      autoApprove: false,
      contextConfidence: contextQuality.confidence,
      reason: "Warnings or policy-sensitive files need human review.",
      reasonCodes: ["risk.medium", ...contextQuality.reasonCodes],
    });
  }
  if (!args.policy.enabled) {
    return decision({
      queue: "watching",
      riskLevel,
      autoApprove: false,
      contextConfidence: contextQuality.confidence,
      reason: "Auto-approval is not enabled in global review policy.",
      reasonCodes: ["auto_approval.disabled", ...contextQuality.reasonCodes],
    });
  }
  if (!args.policy.reviewerId) {
    return decision({
      queue: "watching",
      riskLevel,
      autoApprove: false,
      contextConfidence: contextQuality.confidence,
      reason: "Auto-approval reviewer identity is not configured.",
      reasonCodes: ["auto_approval.no_reviewer", ...contextQuality.reasonCodes],
    });
  }
  if (!args.reviewUsedLlm) {
    return decision({
      queue: "needs_human_review",
      riskLevel,
      autoApprove: false,
      contextConfidence: "low",
      reason: "The review model did not run, so approval needs a human.",
      reasonCodes: ["review.no_llm", ...contextQuality.reasonCodes],
    });
  }
  if (!targetBranchAllowed(args.targetBranch, args.policy.allowedTargetBranches)) {
    return decision({
      queue: "needs_human_review",
      riskLevel,
      autoApprove: false,
      contextConfidence: contextQuality.confidence,
      reason: `Target branch ${args.targetBranch || "not available"} is outside auto-approval policy.`,
      reasonCodes: ["target_branch.not_allowed", ...contextQuality.reasonCodes],
    });
  }
  if (args.changedFiles.length > args.policy.maxChangedFiles) {
    return decision({
      queue: "needs_human_review",
      riskLevel,
      autoApprove: false,
      contextConfidence: contextQuality.confidence,
      reason: `PR changes ${args.changedFiles.length} files; policy allows ${args.policy.maxChangedFiles}.`,
      reasonCodes: ["change_size.too_many_files", ...contextQuality.reasonCodes],
    });
  }
  if (contextQuality.confidence !== "high") {
    return decision({
      queue: "needs_human_review",
      riskLevel: "medium",
      autoApprove: false,
      contextConfidence: contextQuality.confidence,
      reason: "Review context quality is not high enough for auto-approval.",
      reasonCodes: contextQuality.reasonCodes,
    });
  }
  return decision({
    queue: "auto_approved",
    riskLevel,
    autoApprove: true,
    contextConfidence: contextQuality.confidence,
    reason: "Low-risk PR passed auto-approval policy.",
    reasonCodes: ["auto_approval.eligible"],
  });
}

function decision(input: ReviewDecision): ReviewDecision {
  return input;
}

function classifyContextQuality(args: {
  changedFiles: CloudChangedFile[];
  discardedFindingCount?: number;
  hunkCoverageFiles?: number;
  wholeFileFallbackFiles?: number;
  changedHunkLines?: number;
}): { confidence: ReviewDecision["contextConfidence"]; reasonCodes: string[] } {
  const discardedFindingCount = args.discardedFindingCount ?? 0;
  const hunkCoverageFiles = args.hunkCoverageFiles ?? 0;
  const wholeFileFallbackFiles = args.wholeFileFallbackFiles ?? 0;
  const changedHunkLines = args.changedHunkLines ?? 0;
  const reasonCodes: string[] = [];

  if (discardedFindingCount > 0) reasonCodes.push("model_output.discarded_findings");
  if (wholeFileFallbackFiles > 0) reasonCodes.push("context.whole_file_fallback");
  if (args.changedFiles.length > 0 && hunkCoverageFiles === 0 && wholeFileFallbackFiles > 0) {
    reasonCodes.push("context.no_hunk_coverage");
  }
  if (hunkCoverageFiles > 0 && changedHunkLines === 0) reasonCodes.push("context.empty_hunks");

  if (reasonCodes.includes("context.no_hunk_coverage") || discardedFindingCount > 2) {
    return { confidence: "low", reasonCodes };
  }
  if (reasonCodes.length > 0) return { confidence: "medium", reasonCodes };
  return { confidence: "high", reasonCodes };
}

function classifyRisk(
  findings: ReviewFinding[],
  changedFiles: CloudChangedFile[],
  policy: AutoApprovalPolicy,
): ReviewDecision["riskLevel"] {
  if (findings.some((f) => f.severity === "blocking" || f.category === "security")) return "high";
  if (changedFiles.some((f) => isSensitivePath(f.path, policy.sensitivePathPatterns))) return "medium";
  if (findings.some((f) => f.severity === "warning")) return "medium";
  return "low";
}

function targetBranchAllowed(targetBranch: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const normalized = stripRef(targetBranch);
  return allowed.some((branch) => stripRef(branch) === normalized);
}

function isSensitivePath(path: string, patterns: string[]): boolean {
  const normalized = path.replace(/^\/+/, "").replace(/\\/g, "/").toLowerCase();
  return patterns.some((pattern) => {
    const p = pattern.replace(/^\/+/, "").replace(/\\/g, "/").toLowerCase();
    if (!p) return false;
    if (p.endsWith("/")) return normalized.startsWith(p);
    if (p.endsWith("/**")) return normalized.startsWith(p.slice(0, -2));
    return normalized === p || normalized.startsWith(`${p}/`);
  });
}

function stripRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}
