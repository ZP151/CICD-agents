import type { FastifyInstance } from "fastify";
import { runCommand } from "@mergepilot/core";

interface AzureDevOpsRemoteSuggestion {
  remoteName: string;
  remoteUrl: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
}

function cleanRemotePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseAzureDevOpsRemote(remoteName: string, remoteUrl: string): AzureDevOpsRemoteSuggestion | null {
  const raw = remoteUrl.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean).map(cleanRemotePart);
    if (host === "dev.azure.com" && parts.length >= 4 && parts[2] === "_git") {
      return {
        remoteName,
        remoteUrl: raw,
        adoOrgUrl: `https://dev.azure.com/${parts[0]}`,
        adoProject: parts[1] ?? "",
        adoRepoName: parts[3] ?? "",
      };
    }
    if (host.endsWith(".visualstudio.com") && parts.length >= 3 && parts[1] === "_git") {
      const org = host.slice(0, -".visualstudio.com".length);
      return {
        remoteName,
        remoteUrl: raw,
        adoOrgUrl: `https://dev.azure.com/${org}`,
        adoProject: parts[0] ?? "",
        adoRepoName: parts[2] ?? "",
      };
    }
  } catch {
    // SSH remotes and scp-like remotes are parsed below.
  }

  const sshMatch = raw.match(/(?:^|@)(?:ssh\.)?dev\.azure\.com[:/]v3\/([^/]+)\/([^/]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    const [, org = "", project = "", repo = ""] = sshMatch;
    return {
      remoteName,
      remoteUrl: raw,
      adoOrgUrl: `https://dev.azure.com/${cleanRemotePart(org)}`,
      adoProject: cleanRemotePart(project),
      adoRepoName: cleanRemotePart(repo),
    };
  }

  return null;
}

function normalizeGitBranchLine(line: string): string {
  const trimmed = line.replace(/^\*?\s+/, "").trim();
  if (trimmed.startsWith("remotes/")) {
    const afterRemotes = trimmed.slice("remotes/".length);
    const slashIdx = afterRemotes.indexOf("/");
    return slashIdx >= 0 ? afterRemotes.slice(slashIdx + 1) : afterRemotes;
  }
  return trimmed;
}

export function registerGitRoutes(app: FastifyInstance): void {
  app.get("/git/branches", async (req, reply) => {
    const repoPath = (req.query as Record<string, string>)["repoPath"] ?? "";
    if (!repoPath) return reply.code(400).send({ error: "repoPath required" });
    try {
      const result = await runCommand(["git", "branch", "-a"], {
        cwd: repoPath,
        allowed: ["git"],
        timeoutSec: 8,
      });
      if (result.returncode !== 0) {
        return reply.send({ branches: [], error: result.stderr?.trim() || `git exited ${result.returncode}` });
      }
      const branches = (result.stdout ?? "")
        .split(/\r?\n/)
        .map(normalizeGitBranchLine)
        .filter((line) => line && !line.includes(" -> "))
        .filter((line, index, lines) => lines.indexOf(line) === index);
      return reply.send({ branches });
    } catch (err) {
      return reply.send({ branches: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/git/azure-devops-remote", async (req, reply) => {
    const repoPath = (req.query as Record<string, string>)["repoPath"] ?? "";
    if (!repoPath) return reply.code(400).send({ error: "repoPath required" });
    try {
      const result = await runCommand(["git", "remote", "-v"], {
        cwd: repoPath,
        allowed: ["git"],
        timeoutSec: 8,
      });
      if (result.returncode !== 0) {
        return reply.send({ suggestion: null, error: result.stderr?.trim() || `git exited ${result.returncode}` });
      }
      const suggestions = (result.stdout ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim().match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/))
        .filter((match): match is RegExpMatchArray => !!match)
        .filter((match) => match[3] === "fetch")
        .map((match) => parseAzureDevOpsRemote(match[1] ?? "", match[2] ?? ""))
        .filter((suggestion): suggestion is AzureDevOpsRemoteSuggestion => !!suggestion);
      const origin = suggestions.find((suggestion) => suggestion.remoteName === "origin");
      return reply.send({ suggestion: origin ?? suggestions[0] ?? null });
    } catch (err) {
      return reply.send({ suggestion: null, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
