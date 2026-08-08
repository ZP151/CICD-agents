/**
 * Local git transport for the delivery action runtime (chat confirmed-action
 * path).
 *
 * readArtifact re-reads the LOCAL repository — the authoritative source for
 * git workspace writes — exactly as AdoActionTransport re-reads Azure DevOps:
 * a write is never declared complete on tool success alone. execute() is not
 * used on this path: chat writes execute through the confirmed-action tool
 * executor inside approveStreaming; this transport only ever observes git
 * state and delegates ADO-kind refs to the ADO transport.
 */
import { createHash } from "node:crypto";
import { runCommand } from "../../tools/executor.js";
import type { ArtifactRef } from "../artifactRef.js";
import type { ActionRecord } from "./actionTypes.js";
import type { ActionTransport, ArtifactObservation, ExecuteOutcome } from "./actionTransport.js";

export class GitActionTransport implements ActionTransport {
  constructor(
    private readonly repoPath: string,
    private readonly adoTransport?: Pick<ActionTransport, "readArtifact">,
  ) {}

  async execute(_record: ActionRecord): Promise<ExecuteOutcome> {
    // The tool the user approved runs through the confirmed-action executor,
    // never through a second transport path.
    return {
      ok: false,
      result: undefined,
      summary: "git actions execute through the confirmed-action tool executor; transport execute is not used",
    };
  }

  async readArtifact(ref: ArtifactRef): Promise<ArtifactObservation | undefined> {
    switch (ref.kind) {
      case "git_workspace":
        return this.readWorkspace(ref);
      case "git_commit":
        return this.readCommit(ref);
      case "git_branch":
        return this.readBranch(ref);
      case "git_remote":
        return this.readRemote(ref);
      case "git_remote_refs":
        return this.readRemoteRefs(ref);
      default:
        return this.adoTransport?.readArtifact(ref);
    }
  }

  private async readWorkspace(ref: Extract<ArtifactRef, { kind: "git_workspace" }>): Promise<ArtifactObservation | undefined> {
    const status = await this.git(["status", "--porcelain"]);
    if (!status.ok) return undefined;
    const statusHash = sha1(status.stdout);
    const staged = await this.git(["diff", "--cached", "--name-only"]);
    const stagedNames = staged.ok
      ? staged.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      : [];
    return {
      ref: { ...ref, revision: statusHash },
      revision: statusHash,
      fields: { statusHash, staged: stagedNames },
      relations: [],
      correlationIds: [],
    };
  }

  private async readCommit(ref: Extract<ArtifactRef, { kind: "git_commit" }>): Promise<ArtifactObservation | undefined> {
    const sha = await this.git(["rev-parse", "HEAD"]);
    if (!sha.ok || !sha.stdout.trim()) return undefined;
    const headSha = sha.stdout.trim();
    const subject = await this.git(["log", "-1", "--pretty=%s"]);
    return {
      ref: { ...ref, sha: headSha },
      revision: headSha,
      fields: { sha: headSha, subject: subject.ok ? subject.stdout.trim() : "" },
      relations: [],
      correlationIds: [],
    };
  }

  private async readBranch(ref: Extract<ArtifactRef, { kind: "git_branch" }>): Promise<ArtifactObservation | undefined> {
    const tip = await this.git(["rev-parse", "--verify", ref.name]);
    if (!tip.ok || !tip.stdout.trim()) return undefined;
    const sha = tip.stdout.trim();
    return {
      ref: { ...ref, sha },
      revision: sha,
      fields: { sha },
      relations: [],
      correlationIds: [],
    };
  }

  private async readRemote(ref: Extract<ArtifactRef, { kind: "git_remote" }>): Promise<ArtifactObservation | undefined> {
    // refs/remotes/<remote>/<branch> is updated locally by git push/pull, so
    // the re-read is authoritative for the last completed remote sync without
    // a network round trip.
    const tip = await this.git(["rev-parse", "--verify", `refs/remotes/${ref.remote}/${ref.branch}`]);
    if (!tip.ok || !tip.stdout.trim()) return undefined;
    const sha = tip.stdout.trim();
    return {
      ref: { ...ref, sha },
      revision: sha,
      fields: { remoteTip: sha },
      relations: [],
      correlationIds: [],
    };
  }

  private async readRemoteRefs(
    ref: Extract<ArtifactRef, { kind: "git_remote_refs" }>,
  ): Promise<ArtifactObservation | undefined> {
    // The local remote-tracking refs (refs/remotes/<remote>/*) are updated by
    // fetch/push/pull; the hash of the sorted ref list is the revision, so a
    // fetch that brings new or pruned refs moves the artifact.
    const refs = await this.git(["for-each-ref", "--format=%(refname)", `refs/remotes/${ref.remote}`]);
    if (!refs.ok) return undefined;
    const names = refs.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
    const refsHash = sha1(names.join("\n"));
    return {
      ref: { ...ref, revision: refsHash },
      revision: refsHash,
      fields: { refsHash, refs: names },
      relations: [],
      correlationIds: [],
    };
  }

  private async git(args: string[]): Promise<{ ok: boolean; stdout: string }> {
    try {
      const res = await runCommand(["git", ...args], {
        cwd: this.repoPath,
        timeoutSec: 30,
        allowed: ["git"],
        // Reads must never take the index lock (and stall a concurrent write).
        env: { GIT_OPTIONAL_LOCKS: "0" },
      });
      return { ok: res.returncode === 0, stdout: String(res.stdout ?? "") };
    } catch {
      return { ok: false, stdout: "" };
    }
  }
}

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}
