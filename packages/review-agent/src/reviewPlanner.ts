import { LLMClient } from "@cicd-agent/core";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { CloudContextBundle } from "./cloudContext.js";

export interface ReviewFinding {
  file: string;
  line: number;
  severity: "info" | "warning" | "blocking";
  category: "bug" | "missing-test" | "security" | "style" | "design";
  message: string;
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  tokensIn: number;
  tokensOut: number;
}

export const REVIEW_SYSTEM_PROMPT = `You are an automated code reviewer for an internal team.

You see a pull request's changed files (full contents) and a small amount of
related context. Produce a concise summary, then a list of concrete findings.

Rules:
- Only flag real issues. Do not invent file paths or symbols.
- Each finding must be anchored to a file + line that appears in the changed
  files (use the line numbers shown in the file header).
- Categorise each finding as one of: bug, missing-test, security, style, design.
- Severity is "info", "warning", or "blocking". Use "blocking" sparingly.
- Output strictly the following JSON shape (no prose outside the JSON):

{
  "summary": "<markdown summary, 1-3 short paragraphs>",
  "findings": [
    {
      "file": "<repo-relative path>",
      "line": <integer>,
      "severity": "info|warning|blocking",
      "category": "bug|missing-test|security|style|design",
      "message": "<actionable comment, 1-3 sentences>"
    }
  ]
}`;

export function bundleToReviewPrompt(bundle: CloudContextBundle, conventions: string[]): string {
  const parts: string[] = [];
  parts.push(`PR ${bundle.prId} (iteration ${bundle.iterationId}); ${bundle.files.length} file(s) changed.`);
  if (conventions.length > 0) {
    parts.push("\n## Team conventions");
    for (const c of conventions.slice(0, 25)) parts.push(`- ${c}`);
  }
  parts.push("\n## Changed files");
  for (const f of bundle.files) {
    parts.push(`\n### ${f.path} (${f.changeType})`);
    parts.push("```");
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      parts.push(`${i + 1}: ${lines[i]}`);
    }
    parts.push("```");
  }
  if (bundle.relatedSnippets.length > 0) {
    parts.push("\n## Related context");
    for (const s of bundle.relatedSnippets.slice(0, 8)) {
      parts.push(`\n### ${s.path} (${s.reason})`);
      parts.push("```");
      parts.push(s.snippet);
      parts.push("```");
    }
  }
  return parts.join("\n");
}

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
      tokensIn: 0,
      tokensOut: 0,
    };
  }
  const prompt = bundleToReviewPrompt(bundle, conventions);
  const budget = args.charBudget ?? 24000;
  const capped = prompt.length > budget ? prompt.slice(0, budget) + "\n... (truncated)" : prompt;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: REVIEW_SYSTEM_PROMPT },
    { role: "user", content: capped },
  ];
  const resp = await llm.chat({ messages, temperature: 0.1, maxTokens: 1800 });
  const parsed = parseReview(resp.content);
  return {
    summary: parsed?.summary ?? "(model did not return a structured response)",
    findings: parsed?.findings ?? [],
    tokensIn: llm.usage.promptTokens,
    tokensOut: llm.usage.completionTokens,
  };
}

function parseReview(text: string): { summary: string; findings: ReviewFinding[] } | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```(json)?\s*|\s*```$/g, "");
  try {
    const obj = JSON.parse(trimmed) as { summary?: unknown; findings?: unknown };
    const findings = Array.isArray(obj.findings)
      ? obj.findings
          .map((f) => f as Record<string, unknown>)
          .filter((f) => f && typeof f.file === "string" && typeof f.line === "number")
          .map(
            (f): ReviewFinding => ({
              file: String(f.file),
              line: Number(f.line),
              severity: ((["info", "warning", "blocking"] as const).find((s) => s === f.severity) ??
                "info") as ReviewFinding["severity"],
              category: ((["bug", "missing-test", "security", "style", "design"] as const).find(
                (c) => c === f.category,
              ) ?? "style") as ReviewFinding["category"],
              message: String(f.message ?? ""),
            }),
          )
      : [];
    return { summary: typeof obj.summary === "string" ? obj.summary : "", findings };
  } catch {
    return null;
  }
}
