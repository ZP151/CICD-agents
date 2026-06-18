import { LLMClient } from "../llm.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CloudContextBundle } from "./cloudContext.js";
import { postProcessReviewFindings } from "./findingPostProcess.js";
import {
  REVIEW_SYSTEM_PROMPT,
  bundleToCompressedReviewPrompt,
  bundleToReviewPrompt,
  scoreReviewFilePriority,
  summarizeCompression,
  summarizeContextCoverage,
} from "./prompt.js";
import { parseReviewResponse } from "./responseParsing.js";
import {
  DEFAULT_REVIEW_METADATA,
  type ReviewCompressionSummary,
  type ReviewContextCoverage,
  type ReviewDiscardedFinding,
  type ReviewFinding,
  type ReviewMetadata,
  type ReviewResult,
} from "./types.js";

export {
  postProcessReviewFindings,
  REVIEW_SYSTEM_PROMPT,
  bundleToCompressedReviewPrompt,
  bundleToReviewPrompt,
  parseReviewResponse,
  scoreReviewFilePriority,
  summarizeContextCoverage,
};
export {
  DEFAULT_REVIEW_METADATA,
  type ReviewCompressionSummary,
  type ReviewContextCoverage,
  type ReviewDiscardedFinding,
  type ReviewFinding,
  type ReviewMetadata,
  type ReviewPromptCompression,
  type ReviewResult,
} from "./types.js";

export async function runReviewPlanner(args: {
  llm: LLMClient;
  bundle: CloudContextBundle;
  conventions: string[];
  charBudget?: number;
}): Promise<ReviewResult> {
  const { llm, bundle, conventions } = args;
  if (!llm.configured) {
    return {
      summary:
        "_Automated review skipped: Azure OpenAI not configured. Configure AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in the review-agent environment._",
      findings: [],
      discardedFindings: [],
      metadata: DEFAULT_REVIEW_METADATA,
      compression: {
        compressed: false,
        includedFiles: bundle.files.map((file) => file.path),
        omittedFiles: [],
      },
      coverage: summarizeContextCoverage(bundle),
      tokensIn: 0,
      tokensOut: 0,
    };
  }
  const budget = args.charBudget ?? 24000;
  const compression = bundleToCompressedReviewPrompt(bundle, conventions, budget);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: REVIEW_SYSTEM_PROMPT },
    { role: "user", content: compression.prompt },
  ];
  const resp = await llm.chat({ messages, temperature: 0.1, maxTokens: 1800 });
  const parsed = parseReviewResponse(resp.content);
  const processedFindings = postProcessReviewFindings(parsed?.findings ?? [], bundle);
  return {
    summary: parsed?.summary ?? "(model did not return a structured response)",
    findings: processedFindings.findings,
    discardedFindings: processedFindings.discardedFindings,
    metadata: parsed?.metadata ?? DEFAULT_REVIEW_METADATA,
    compression: summarizeCompression(compression),
    coverage: summarizeContextCoverage(bundle),
    tokensIn: llm.usage.promptTokens,
    tokensOut: llm.usage.completionTokens,
  };
}
