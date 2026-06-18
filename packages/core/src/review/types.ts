export interface ReviewFinding {
  file: string;
  line: number;
  severity: "info" | "warning" | "blocking";
  category: "bug" | "missing-test" | "security" | "style" | "design";
  message: string;
}

export interface ReviewMetadata {
  estimatedEffort: 1 | 2 | 3 | 4 | 5;
  testsRequired: boolean;
  securityConcern: boolean;
  canBeSplit: boolean;
  keyIssues: string[];
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  discardedFindings: ReviewDiscardedFinding[];
  metadata: ReviewMetadata;
  compression: ReviewCompressionSummary;
  coverage: ReviewContextCoverage;
  tokensIn: number;
  tokensOut: number;
}

export interface ReviewContextCoverage {
  totalFiles: number;
  filesWithHunks: number;
  wholeFileOnlyFiles: number;
  hunkCount: number;
  changedHunkLines: number;
}

export interface ReviewDiscardedFinding {
  file: string;
  line: number;
  severity: ReviewFinding["severity"];
  category: ReviewFinding["category"];
  message: string;
  reason: "unknown_file" | "invalid_line" | "outside_changed_hunk" | "empty_message" | "duplicate";
}

export const DEFAULT_REVIEW_METADATA: ReviewMetadata = {
  estimatedEffort: 1,
  testsRequired: false,
  securityConcern: false,
  canBeSplit: false,
  keyIssues: [],
};

export interface ReviewPromptCompression {
  prompt: string;
  compressed: boolean;
  includedFiles: string[];
  omittedFiles: string[];
}

export interface ReviewCompressionSummary {
  compressed: boolean;
  includedFiles: string[];
  omittedFiles: string[];
}
