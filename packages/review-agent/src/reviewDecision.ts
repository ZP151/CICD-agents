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
}

export const DEFAULT_AUTO_APPROVAL_POLICY: AutoApprovalPolicy = {
  enabled: false,
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
}): ReviewDecision {
  const riskLevel = classifyRisk(args.findings, args.changedFiles, args.policy);
  if (riskLevel === "high") {
    return { queue: "blocked", riskLevel, autoApprove: false, reason: "Blocking findings or sensitive changes require a human." };
  }
  if (riskLevel === "medium") {
    return { queue: "needs_human_review", riskLevel, autoApprove: false, reason: "Warnings or policy-sensitive files need human review." };
  }
  if (!args.policy.enabled) {
    return { queue: "needs_human_review", riskLevel, autoApprove: false, reason: "Auto-approval is disabled by policy." };
  }
  if (!args.policy.reviewerId) {
    return { queue: "needs_human_review", riskLevel, autoApprove: false, reason: "Auto-approval reviewer identity is not configured." };
  }
  if (!args.reviewUsedLlm) {
    return { queue: "needs_human_review", riskLevel, autoApprove: false, reason: "The review model did not run, so approval needs a human." };
  }
  if (!targetBranchAllowed(args.targetBranch, args.policy.allowedTargetBranches)) {
    return { queue: "needs_human_review", riskLevel, autoApprove: false, reason: `Target branch ${args.targetBranch || "(unknown)"} is outside auto-approval policy.` };
  }
  if (args.changedFiles.length > args.policy.maxChangedFiles) {
    return { queue: "needs_human_review", riskLevel, autoApprove: false, reason: `PR changes ${args.changedFiles.length} files; policy allows ${args.policy.maxChangedFiles}.` };
  }
  return { queue: "auto_approved", riskLevel, autoApprove: true, reason: "Low-risk PR passed auto-approval policy." };
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
