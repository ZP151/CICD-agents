import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GitActionTransport,
  artifactStableKey,
  type ArtifactRef,
} from "../src/index.js";

let repoPath: string;

function git(args: string[], cwd = repoPath): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

beforeEach(() => {
  repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "git-action-transport-"));
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repoPath, "notes.txt"), "hello\n");
  git(["add", "notes.txt"]);
  git(["commit", "-m", "initial commit"]);
});

afterEach(() => {
  fs.rmSync(repoPath, { recursive: true, force: true });
});

const pl = "pl-1";

describe("GitActionTransport.readArtifact", () => {
  it("reads git_workspace: staged names and a stable status hash", async () => {
    const transport = new GitActionTransport(repoPath);
    const before = await transport.readArtifact({ kind: "git_workspace", projectLinkId: pl, repoPath, revision: "" });
    expect(before).toBeDefined();
    expect((before!.fields["staged"] as string[]).sort()).toEqual([]);

    fs.writeFileSync(path.join(repoPath, "notes.txt"), "hello\nworld\n");
    git(["add", "notes.txt"]);
    const after = await transport.readArtifact({ kind: "git_workspace", projectLinkId: pl, repoPath, revision: "" });
    expect(after!.fields["staged"]).toEqual(["notes.txt"]);
    expect(after!.revision).not.toBe(before!.revision);
    expect(after!.ref).toMatchObject({ kind: "git_workspace", revision: after!.revision });
  });

  it("reads git_commit: HEAD sha and subject", async () => {
    const transport = new GitActionTransport(repoPath);
    const head = git(["rev-parse", "HEAD"]);
    const observation = await transport.readArtifact({ kind: "git_commit", projectLinkId: pl, repoPath, sha: "" });
    expect(observation).toBeDefined();
    expect(observation!.fields["sha"]).toBe(head);
    expect(observation!.fields["subject"]).toBe("initial commit");
    expect(observation!.ref).toMatchObject({ kind: "git_commit", sha: head });
  });

  it("reads git_branch: current branch tip", async () => {
    const transport = new GitActionTransport(repoPath);
    const head = git(["rev-parse", "HEAD"]);
    const observation = await transport.readArtifact({ kind: "git_branch", projectLinkId: pl, repoPath, name: "main", sha: "" });
    expect(observation).toBeDefined();
    expect(observation!.fields["sha"]).toBe(head);
  });

  it("returns undefined for a missing branch and a missing remote ref", async () => {
    const transport = new GitActionTransport(repoPath);
    const branch = await transport.readArtifact({ kind: "git_branch", projectLinkId: pl, repoPath, name: "nope", sha: "" });
    expect(branch).toBeUndefined();
    const remote = await transport.readArtifact({
      kind: "git_remote",
      projectLinkId: pl,
      repoPath,
      remote: "origin",
      branch: "main",
      sha: "",
    });
    expect(remote).toBeUndefined();
  });

  it("reads git_remote after a push updates the local remote-tracking ref", async () => {
    // Simulate a push by creating the remote-tracking ref exactly as git push
    // would (the transport must never hit the network).
    const head = git(["rev-parse", "HEAD"]);
    fs.mkdirSync(path.join(repoPath, ".git", "refs", "remotes", "origin"), { recursive: true });
    fs.writeFileSync(path.join(repoPath, ".git", "refs", "remotes", "origin", "main"), `${head}\n`);
    const transport = new GitActionTransport(repoPath);
    const observation = await transport.readArtifact({
      kind: "git_remote",
      projectLinkId: pl,
      repoPath,
      remote: "origin",
      branch: "main",
      sha: "",
    });
    expect(observation).toBeDefined();
    expect(observation!.fields["remoteTip"]).toBe(head);
  });

  it("delegates ADO-kind refs to the injected ADO transport", async () => {
    let delegated: ArtifactRef | undefined;
    const adoTransport = {
      readArtifact: async (ref: ArtifactRef) => {
        delegated = ref;
        return undefined;
      },
    };
    const transport = new GitActionTransport(repoPath, adoTransport);
    const ref: ArtifactRef = { kind: "work_item", projectLinkId: pl, id: 7, revision: 2 };
    await transport.readArtifact(ref);
    expect(delegated).toEqual(ref);
  });

  it("returns undefined outside a git repository", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "not-a-repo-"));
    try {
      const transport = new GitActionTransport(outside);
      const observation = await transport.readArtifact({
        kind: "git_workspace",
        projectLinkId: pl,
        repoPath: outside,
        revision: "",
      });
      expect(observation).toBeUndefined();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("execute refuses: chat writes run through the confirmed-action executor", async () => {
    const transport = new GitActionTransport(repoPath);
    const outcome = await transport.execute({} as never);
    expect(outcome.ok).toBe(false);
  });
});

describe("git artifact stable keys", () => {
  it("git_workspace key is scoped by project link and repo path, not revision", () => {
    expect(artifactStableKey({ kind: "git_workspace", projectLinkId: pl, repoPath: "C:/a", revision: "h1" }))
      .toBe(artifactStableKey({ kind: "git_workspace", projectLinkId: pl, repoPath: "C:/a", revision: "h2" }));
    expect(artifactStableKey({ kind: "git_workspace", projectLinkId: pl, repoPath: "C:/a", revision: "h1" }))
      .not.toBe(artifactStableKey({ kind: "git_workspace", projectLinkId: pl, repoPath: "C:/b", revision: "h1" }));
  });

  it("git_remote key includes remote and branch", () => {
    const base = { projectLinkId: pl, repoPath: "C:/a" } as const;
    expect(artifactStableKey({ kind: "git_remote", ...base, remote: "origin", branch: "main", sha: "s1" }))
      .toBe(artifactStableKey({ kind: "git_remote", ...base, remote: "origin", branch: "main", sha: "s2" }));
    expect(artifactStableKey({ kind: "git_remote", ...base, remote: "origin", branch: "main", sha: "s1" }))
      .not.toBe(artifactStableKey({ kind: "git_remote", ...base, remote: "upstream", branch: "main", sha: "s1" }));
  });
});
