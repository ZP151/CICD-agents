import { parseDiff, type ChangedFile } from "./contextBuilder.js";
import { runCommand } from "./tools/executor.js";

const GIT_INTENT_RE =
  /\b(git|status|diff|commit|branch|push|pull|merge|rebase|stash|pr|pull request|changes?|changed|review|stage|checkout)\b/i;

export function shouldInspectGit(message: string): boolean {
  return GIT_INTENT_RE.test(message);
}

export async function getChangedFiles(repoPath: string, targetBranch = "main"): Promise<ChangedFile[]> {
  try {
    const diff = await runCommand(["git", "diff", `${targetBranch}...HEAD`], {
      cwd: repoPath,
      allowed: ["git"],
      timeoutSec: 30,
    });
    if (diff.returncode === 0 && diff.stdout.trim()) return parseDiff(diff.stdout);
  } catch {
    // fall back to working tree diff
  }
  try {
    const diff = await runCommand(["git", "diff", "HEAD"], {
      cwd: repoPath,
      allowed: ["git"],
      timeoutSec: 30,
    });
    return parseDiff(diff.stdout);
  } catch {
    return [];
  }
}

export async function getChangeDiffExcerpt(
  repoPath: string,
  targetBranch = "main",
  maxChars = 9000,
): Promise<string> {
  const attempts = [
    ["diff", "--unified=40", `${targetBranch}...HEAD`],
    ["diff", "--unified=40", "HEAD"],
  ];
  for (const args of attempts) {
    try {
      const diff = await runCommand(["git", ...args], {
        cwd: repoPath,
        allowed: ["git"],
        timeoutSec: 30,
      });
      const text = diff.stdout.trim();
      if (diff.returncode === 0 && text) {
        return text.length > maxChars ? `${text.slice(0, maxChars)}\n...diff truncated...` : text;
      }
    } catch {
      // try the next diff shape
    }
  }
  return "";
}

export function inferChangeSummary(files: ChangedFile[], diffExcerpt = ""): string {
  const paths = files.map((file) => file.path.toLowerCase());
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const areas: string[] = [];
  if (paths.some((file) => /test|spec/.test(file))) areas.push("tests");
  if (paths.some((file) => /controller|route|api|endpoint/.test(file))) areas.push("API/controller behavior");
  if (paths.some((file) => /service|manager|client|provider/.test(file))) areas.push("service/client logic");
  if (paths.some((file) => /config|settings|appsettings|\.env|pipeline|workflow|dockerfile/.test(file))) areas.push("configuration or CI/CD");
  if (paths.some((file) => /model|schema|migration|entity|dto/.test(file))) areas.push("data model/schema");
  if (paths.some((file) => /\.(tsx|jsx|css|scss)$/.test(file))) areas.push("frontend/UI");
  if (paths.some((file) => /\.(cs)$/.test(file))) areas.push(".NET code");
  if (paths.some((file) => /\.(ts|js|mts|mjs)$/.test(file))) areas.push("TypeScript/JavaScript code");

  const signals: string[] = [];
  const lowerDiff = diffExcerpt.toLowerCase();
  if (/\b(auth|token|permission|credential|oauth|pat)\b/.test(lowerDiff)) signals.push("authentication/permission handling");
  if (/(secret|api[_-]?key|apikey|password|connectionstring|connection string|client[_-]?secret)/.test(lowerDiff)) {
    signals.push("secret/configuration risk");
  }
  if (/\b(error|exception|catch|retry|fallback|diagnostic)\b/.test(lowerDiff)) signals.push("error handling or diagnostics");
  if (/\b(validate|validation|required|schema)\b/.test(lowerDiff)) signals.push("validation");
  if (/\b(stream|delta|event|sse)\b/.test(lowerDiff)) signals.push("streaming/event flow");
  if (/\b(stage|commit|push|branch|status)\b/.test(lowerDiff)) signals.push("Git workflow behavior");

  const areaText = areas.length > 0 ? areas.slice(0, 4).join(", ") : "general code";
  const signalText = signals.length > 0 ? ` Signals in the diff suggest ${signals.slice(0, 4).join(", ")}.` : "";
  return `Likely change focus: ${areaText}. Scope: ${files.length} file(s), +${totalAdditions}/-${totalDeletions}.${signalText}`;
}
