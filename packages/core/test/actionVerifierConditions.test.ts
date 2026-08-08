import { describe, expect, it } from "vitest";
import {
  ActionVerifier,
  artifactStableKey,
  type ArtifactObservation,
  type ArtifactRef,
  type VerificationPredicate,
} from "../src/index.js";

const workspace = (revision: string): ArtifactRef => ({
  kind: "git_workspace",
  projectLinkId: "pl-1",
  repoPath: "C:/repo",
  revision,
});

const commit = (sha: string): ArtifactRef => ({
  kind: "git_commit",
  projectLinkId: "pl-1",
  repoPath: "C:/repo",
  sha,
});

function observationFor(ref: ArtifactRef, fields: Record<string, unknown>, revision?: string): ArtifactObservation {
  return { ref, revision: revision ?? fields["statusHash"] ?? fields["sha"], fields, relations: [], correlationIds: [] };
}

function reader(map: Map<string, ArtifactObservation>) {
  return { readArtifact: async (ref: ArtifactRef) => map.get(artifactStableKey(ref)) };
}

async function verify(predicates: VerificationPredicate[], observations: Map<string, ArtifactObservation>) {
  const verifier = new ActionVerifier(reader(observations));
  return verifier.verify(
    {
      expectedResult: predicates,
    } as Parameters<ActionVerifier["verify"]>[0],
    { attempts: 3, intervalMs: 5, timeoutMs: 500 },
  );
}

describe("field_ne — write moved the artifact away from its proposed baseline", () => {
  it("satisfied when the observed field differs from the baseline", async () => {
    // The stable key excludes sha (HEAD position is the identity); the
    // observation carries the moved sha as the field value.
    const observations = new Map([
      [artifactStableKey(commit("old")), observationFor(commit("old"), { sha: "abc123", subject: "new commit" })],
    ]);
    const outcome = await verify(
      [{ artifact: commit("old"), condition: "field_ne", field: "sha", expected: "old" }],
      observations,
    );
    expect(outcome.status).toBe("verified");
  });

  it("pending while the field is still at the baseline", async () => {
    const observations = new Map([
      [artifactStableKey(commit("old")), observationFor(commit("old"), { sha: "old" })],
    ]);
    const outcome = await verify(
      [{ artifact: commit("old"), condition: "field_ne", field: "sha", expected: "old" }],
      observations,
    );
    expect(outcome.status).toBe("timeout");
  });

  it("pending while the field is missing (write may not have landed)", async () => {
    const observations = new Map([
      [artifactStableKey(workspace("h1")), observationFor(workspace("h1"), { statusHash: "h1" })],
    ]);
    const outcome = await verify(
      [{ artifact: workspace("h1"), condition: "field_ne", field: "missing", expected: "x" }],
      observations,
    );
    expect(outcome.status).toBe("timeout");
  });
});

describe("field_contains — the write produced expected content", () => {
  it("satisfied when every expected element is present", async () => {
    const observations = new Map([
      [artifactStableKey(workspace("h1")), observationFor(workspace("h1"), { staged: ["a.ts", "b.ts"], statusHash: "h1" })],
    ]);
    const outcome = await verify(
      [{ artifact: workspace("h1"), condition: "field_contains", field: "staged", expected: ["a.ts", "b.ts"] }],
      observations,
    );
    expect(outcome.status).toBe("verified");
  });

  it("pending while an expected element is missing", async () => {
    const observations = new Map([
      [artifactStableKey(workspace("h1")), observationFor(workspace("h1"), { staged: ["a.ts"] })],
    ]);
    const outcome = await verify(
      [{ artifact: workspace("h1"), condition: "field_contains", field: "staged", expected: ["a.ts", "b.ts"] }],
      observations,
    );
    expect(outcome.status).toBe("timeout");
  });

  it("satisfied with no expected elements when the field is non-empty", async () => {
    const observations = new Map([
      [artifactStableKey(workspace("h1")), observationFor(workspace("h1"), { staged: ["a.ts"] })],
    ]);
    const outcome = await verify(
      [{ artifact: workspace("h1"), condition: "field_contains", field: "staged" }],
      observations,
    );
    expect(outcome.status).toBe("verified");
  });

  it("pending while the field is empty with no expected elements", async () => {
    const observations = new Map([
      [artifactStableKey(workspace("h1")), observationFor(workspace("h1"), { staged: [] })],
    ]);
    const outcome = await verify(
      [{ artifact: workspace("h1"), condition: "field_contains", field: "staged" }],
      observations,
    );
    expect(outcome.status).toBe("timeout");
  });
});
