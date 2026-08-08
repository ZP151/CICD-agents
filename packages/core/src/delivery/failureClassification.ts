/**
 * Failure classification (Cycle 03).
 *
 * Deterministic detectors run before the model: code regression,
 * pipeline/YAML/configuration, dependency/package/service, agent/
 * infrastructure, permission/credential, flaky test, cancelled/user
 * action, unknown/insufficient evidence. Classification is evaluated
 * against the recorded human resolution, never the first error string.
 */
import { normalizeFailureText } from "./failureEvidence.js";

export type FailureClass =
  | "code_regression"
  | "pipeline_configuration"
  | "dependency"
  | "agent_infrastructure"
  | "permission_credential"
  | "flaky_test"
  | "cancelled"
  | "unknown";

export interface ClassificationVerdict {
  class: FailureClass;
  confidence: number;
  decisiveEvidence: string[];
  missingEvidence: string[];
}

export interface ClassifierInput {
  taskNames: string[];
  logExcerpts: string[];
  changedFiles: string[];
  hasPublishedTests: boolean;
  cancelledByUser: boolean;
}

const DETECTORS: Array<{
  class: FailureClass;
  matches: (input: ClassifierInput) => { confidence: number; evidence: string[] };
}> = [
  {
    class: "cancelled",
    matches: (input) => {
      const cancelled = input.cancelledByUser
        || input.taskNames.some((name) => /cancel/i.test(name))
        || input.logExcerpts.some((text) => /operation cancelled|user cancelled|##[warning]Pipeline cancelled/i.test(text));
      return cancelled
        ? { confidence: 0.95, evidence: ["run or task marked cancelled"] }
        : { confidence: 0, evidence: [] };
    },
  },
  {
    class: "permission_credential",
    matches: (input) => {
      const evidence = input.logExcerpts.filter((text) =>
        /access denied|unauthorized|401|403|TF400813|TF237091|not authorized|service connection|credential/i.test(text),
      );
      return evidence.length > 0
        ? { confidence: 0.9, evidence: evidence.slice(0, 2).map((text) => text.slice(0, 160)) }
        : { confidence: 0, evidence: [] };
    },
  },
  {
    class: "pipeline_configuration",
    matches: (input) => {
      const evidence = input.logExcerpts.filter((text) =>
        /yaml|azure-pipelines\.yml|template|##[error]Unhandled|pipeline configuration|invalid pipeline|TF201073|not found.*(stage|job|task)/i.test(text),
      );
      return evidence.length > 0
        ? { confidence: 0.85, evidence: evidence.slice(0, 2).map((text) => text.slice(0, 160)) }
        : { confidence: 0, evidence: [] };
    },
  },
  {
    class: "dependency",
    matches: (input) => {
      const evidence = input.logExcerpts.filter((text) =>
        /nuget|npm|package|restore|feed|unable to find package|could not resolve|403 Forbidden.*feed/i.test(text),
      );
      return evidence.length > 0
        ? { confidence: 0.8, evidence: evidence.slice(0, 2).map((text) => text.slice(0, 160)) }
        : { confidence: 0, evidence: [] };
    },
  },
  {
    class: "agent_infrastructure",
    matches: (input) => {
      const evidence = input.logExcerpts.filter((text) =>
        /timeout|timed out|connection.*(refused|reset)|no space left|disk|agent.*unavailable|ETIMEDOUT|ECONNREFUSED/i.test(text),
      );
      return evidence.length > 0
        ? { confidence: 0.8, evidence: evidence.slice(0, 2).map((text) => text.slice(0, 160)) }
        : { confidence: 0, evidence: [] };
    },
  },
  {
    class: "flaky_test",
    matches: (input) => {
      const evidence = input.logExcerpts.filter((text) =>
        /flaky|rerun.*passed|passed on retry|intermittent/i.test(text),
      );
      const hasTests = input.hasPublishedTests;
      return hasTests && evidence.length > 0
        ? { confidence: 0.7, evidence: evidence.slice(0, 2).map((text) => text.slice(0, 160)) }
        : { confidence: 0, evidence: [] };
    },
  },
  {
    class: "code_regression",
    matches: (input) => {
      const compileLike = input.logExcerpts.filter((text) =>
        /error CS\d+|TS\d+: error|error TS\d+|does not contain a definition|cannot convert|failed to compile|##[error].*(error CS|TS\d+)/i.test(text),
      );
      const changedCode = input.changedFiles.some((file) => /\.(cs|ts|js|tsx|jsx|py|go|rs|java)$/i.test(file));
      const buildTask = input.taskNames.some((name) => /build|msbuild|compile|vstest|dotnet build/i.test(name));
      if (compileLike.length > 0 && (changedCode || buildTask)) {
        return { confidence: 0.85, evidence: compileLike.slice(0, 2).map((text) => text.slice(0, 160)) };
      }
      const testFailures = input.logExcerpts.filter((text) => /failed.*test|test.*failed|Assert\.|Xunit|NUnit|mstest/i.test(text));
      if (testFailures.length > 0 && changedCode) {
        return { confidence: 0.7, evidence: testFailures.slice(0, 2).map((text) => text.slice(0, 160)) };
      }
      return { confidence: 0, evidence: [] };
    },
  },
];

/** Deterministic classification; the model synthesizes only ambiguous cases. */
export function classifyFailure(input: ClassifierInput): ClassificationVerdict {
  let best: ClassificationVerdict | null = null;
  for (const detector of DETECTORS) {
    const result = detector.matches(input);
    if (result.confidence > 0 && (!best || result.confidence > best.confidence)) {
      best = {
        class: detector.class,
        confidence: result.confidence,
        decisiveEvidence: result.evidence,
        missingEvidence: [],
      };
    }
  }
  if (best) return best;
  const hasAny = input.logExcerpts.length > 0 || input.taskNames.length > 0;
  return {
    class: "unknown",
    confidence: hasAny ? 0.4 : 0.1,
    decisiveEvidence: [],
    missingEvidence: hasAny
      ? ["no deterministic detector matched; model synthesis required"]
      : ["no timeline or log evidence available"],
  };
}

/** Stable normalized signature for incident aggregation. */
export function failureSignatureFor(
  definitionId: number,
  taskName: string,
  logText: string,
): { definitionId: number; taskName: string; errorClass: string; normalizedText: string } {
  const normalized = normalizeFailureText(logText);
  const errorClass = normalized.match(/error [A-Z0-9_]+|(?:^| )(?:error|failed):? [a-z0-9 ]{3,60}/i)?.[0]?.trim() ?? "generic";
  return { definitionId, taskName, errorClass, normalizedText: normalized.slice(0, 200) };
}
