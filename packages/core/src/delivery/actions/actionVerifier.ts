/**
 * Action verification.
 *
 * Verification re-reads the authoritative artifact until the expected
 * predicates hold, a terminal contradiction appears, or the timeout is
 * reached. Outcomes: verified, contradicted, timeout. A stale target revision
 * or a duplicate execution request is detected BEFORE any write by the
 * policy; the verifier only ever observes remote state.
 */
import { artifactStableKey } from "../artifactRef.js";
import type { ActionRecord, VerificationPredicate } from "./actionTypes.js";
import type { ActionTransport, ArtifactObservation, ActionVerifierOptions } from "./actionTransport.js";

export type VerificationStatus = "verified" | "contradicted" | "timeout";

export interface VerificationOutcome {
  status: VerificationStatus;
  evidence: string[];
}

export interface ArtifactReader {
  readArtifact(ref: VerificationPredicate["artifact"]): Promise<ArtifactObservation | undefined>;
}

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 60_000;

export class ActionVerifier {
  constructor(private readonly transport: Pick<ActionTransport, "readArtifact">) {}

  async verify(
    record: ActionRecord,
    options: ActionVerifierOptions = {},
  ): Promise<VerificationOutcome> {
    const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = options.now?.() ?? Date.now();
    const deadline = started + timeoutMs;

    // Verification means re-reading the authoritative artifact. An action
    // without predicates cannot be verified; refusing here prevents a write
    // from being declared complete on HTTP success alone.
    if (record.expectedResult.length === 0) {
      return {
        status: "contradicted",
        evidence: ["action carries no verification predicates; re-read verification is impossible"],
      };
    }

    const evidence: string[] = [];
    let attempt = 0;
    while (attempt < attempts) {
      attempt += 1;
      const now = options.now?.() ?? Date.now();
      if (now >= deadline) {
        return { status: "timeout", evidence: [...evidence, "verification deadline reached"] };
      }
      const outcomes = await Promise.all(
        record.expectedResult.map((predicate) =>
          this.evaluatePredicate(predicate, options).then((outcome) => ({ predicate, outcome })),
        ),
      );
      for (const { predicate, outcome } of outcomes) {
        if (outcome.kind === "satisfied") {
          evidence.push(`${describePredicate(predicate)} verified (${outcome.detail})`);
        }
      }
      if (outcomes.some(({ outcome }) => outcome.kind === "contradicted")) {
        const contradiction = outcomes.find(({ outcome }) => outcome.kind === "contradicted")!;
        return {
          status: "contradicted",
          evidence: [
            ...evidence,
            `${describePredicate(contradiction.predicate)} contradicted: ${contradiction.outcome.detail}`,
          ],
        };
      }
      if (outcomes.every(({ outcome }) => outcome.kind === "satisfied")) {
        return { status: "verified", evidence };
      }
      await sleep(intervalMs);
    }
    return { status: "timeout", evidence: [...evidence, `verification gave up after ${attempts} attempts`] };
  }

  private async evaluatePredicate(
    predicate: VerificationPredicate,
    options: ActionVerifierOptions,
  ): Promise<{ kind: "satisfied" | "pending" | "contradicted"; detail: string }> {
    let observation: ArtifactObservation | undefined;
    try {
      observation = await this.transport.readArtifact(predicate.artifact);
    } catch {
      return { kind: "pending", detail: "artifact read failed; retrying" };
    }
    if (!observation) {
      if (predicate.condition === "not_exists") {
        return { kind: "satisfied", detail: "artifact is gone" };
      }
      return predicate.condition === "exists"
        ? { kind: "pending", detail: "artifact not yet visible" }
        : { kind: "contradicted", detail: "artifact does not exist" };
    }
    switch (predicate.condition) {
      case "exists":
        return { kind: "satisfied", detail: `revision ${String(observation.revision ?? "")}` };
      case "not_exists":
        return { kind: "contradicted", detail: "artifact still exists" };
      case "revision_gt": {
        const current = observation.revision;
        const base = predicate.expectedRevision ?? 0;
        if (typeof current === "number" && typeof base === "number") {
          return current > base
            ? { kind: "satisfied", detail: `revision ${current} > ${base}` }
            : { kind: "pending", detail: `revision ${current} not yet past ${base}` };
        }
        return { kind: "pending", detail: "revision not comparable yet" };
      }
      case "field_eq": {
        if (!predicate.field) return { kind: "contradicted", detail: "field_eq without field" };
        const value = observation.fields[predicate.field];
        const expected = predicate.expected;
        if (value === expected || String(value) === String(expected)) {
          return { kind: "satisfied", detail: `${predicate.field}=${String(value)}` };
        }
        return { kind: "pending", detail: `${predicate.field}=${String(value)} still differs from expected` };
      }
      case "relation_present": {
        // ADO relation urls are opaque (vstfs://...); a substring match on
        // the target id is the robust equivalent of "relation exists".
        const expected = String(predicate.expected ?? "");
        if (expected && !observation.relations.some((relation) => relation.includes(expected))) {
          return { kind: "pending", detail: `relation ${expected} not yet present` };
        }
        return { kind: "satisfied", detail: `relation ${expected} present` };
      }
      case "run_visible": {
        if (predicate.correlation && !observation.correlationIds.includes(predicate.correlation)) {
          return { kind: "pending", detail: `run ${predicate.correlation} not yet visible` };
        }
        return { kind: "satisfied", detail: `run ${predicate.correlation ?? ""} visible` };
      }
      case "comment_contains": {
        const expected = String(predicate.expected ?? "");
        const comments = observation.comments ?? [];
        if (expected && !comments.some((comment) => comment.includes(expected))) {
          return { kind: "pending", detail: `comment with expected text not yet visible (${comments.length} comments)` };
        }
        return { kind: "satisfied", detail: `comment present (${comments.length} total)` };
      }
      default:
        return { kind: "contradicted", detail: "unsupported predicate condition" };
    }
  }
}

export function describePredicate(predicate: VerificationPredicate): string {
  const target = artifactStableKey(predicate.artifact);
  switch (predicate.condition) {
    case "exists":
      return `${target} exists`;
    case "not_exists":
      return `${target} no longer exists`;
    case "field_eq":
      return `${target} ${predicate.field ?? "?"}=${String(predicate.expected ?? "")}`;
    case "relation_present":
      return `${target} has relation ${String(predicate.expected ?? "")}`;
    case "revision_gt":
      return `${target} revision > ${predicate.expectedRevision ?? 0}`;
    case "run_visible":
      return `${target} run ${predicate.correlation ?? ""} visible`;
    case "comment_contains":
      return `${target} comment contains ${String(predicate.expected ?? "")}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
