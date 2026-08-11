#!/usr/bin/env node

/**
 * Installed-desktop ClaimBot_API vertical-loop acceptance.
 *
 * This runner attaches Playwright to the installed Tauri WebView2 through a
 * loopback CDP port. It therefore exercises the actual installed desktop UI
 * and installed sidecar while keeping every assertion text/DOM/event based —
 * no screenshot interpretation is required.
 *
 * The real write is guarded by two explicit environment switches and targets
 * only an existing `[MergePilot Fixture]` Work Item. Fixture assignment is a
 * canonical setup action; the acceptance write-back itself is proposed and
 * approved through the installed Work UI, followed by an authoritative ADO
 * re-read.
 */
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const runtimeUrl = process.env.MERGEPILOT_INSTALLED_RUNTIME_URL ?? "http://127.0.0.1:8787";
const installedDesktop = process.env.MERGEPILOT_INSTALLED_DESKTOP
  ?? "C:\\Program Files\\MergePilot\\mergepilot-desktop.exe";
const installedDaemon = process.env.MERGEPILOT_INSTALLED_DAEMON
  ?? "C:\\Program Files\\MergePilot\\mergepilot-daemon.exe";
const cdpPort = Number(process.env.MERGEPILOT_INSTALLED_CDP_PORT ?? "9333");
const cdpBaseUrl = `http://127.0.0.1:${cdpPort}`;
const fixtureWorkItemId = Number(process.env.MERGEPILOT_FIXTURE_WORK_ITEM_ID ?? "7919");
const fixturePullRequestId = Number(process.env.MERGEPILOT_FIXTURE_PULL_REQUEST_ID ?? "2807");
const fixtureBuildId = Number(process.env.MERGEPILOT_FIXTURE_BUILD_ID ?? "4850");
const expectedVersion = process.env.MERGEPILOT_EXPECTED_VERSION
  ?? JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function basenamePortable(value) {
  const normalized = String(value ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function selectClaimBotProjectLink(links, activeProjectLinkId = "") {
  const matches = links.filter((link) =>
    basenamePortable(link.repoPath).toLowerCase() === "claimbot_api"
    || String(link.name ?? "").toLowerCase().includes("claimbot_api"),
  );
  if (activeProjectLinkId) {
    const selected = matches.filter((link) => String(link.id ?? "") === activeProjectLinkId);
    assert(selected.length === 1, "the installed UI Context does not select a ClaimBot_API Project Link");
    return selected[0];
  }
  assert(matches.length === 1, `expected one ClaimBot_API Project Link, found ${matches.length}`);
  return matches[0];
}

export function fixtureCoverage(detail, expected = {}) {
  const workItemId = Number(expected.workItemId ?? fixtureWorkItemId);
  const pullRequestId = Number(expected.pullRequestId ?? fixturePullRequestId);
  const buildId = Number(expected.buildId ?? fixtureBuildId);
  assert(detail && Number(detail.id) === workItemId, `expected Work Item ${workItemId}`);
  assert(String(detail.title ?? "").startsWith("[MergePilot Fixture]"), "target is not a MergePilot fixture");
  const pullRequest = (detail.linkedPullRequests ?? []).find((entry) => Number(entry.id) === pullRequestId);
  const build = (detail.linkedBuilds ?? []).find((entry) => Number(entry.id) === buildId);
  assert(pullRequest, `fixture does not link Pull Request ${pullRequestId}`);
  assert(build, `fixture does not link build ${buildId}`);
  return {
    workItemId,
    workItemRevision: Number(detail.revision ?? 0),
    pullRequestId,
    pullRequestStatus: String(pullRequest.status ?? "unknown"),
    buildId,
    buildStatus: String(build.status ?? "unknown"),
    buildResult: String(build.result ?? "unknown"),
  };
}

export function redactedActionEvidence(record) {
  return {
    id: String(record?.id ?? ""),
    kind: String(record?.kind ?? ""),
    status: String(record?.status ?? ""),
    targetKind: String(record?.target?.kind ?? ""),
    targetId: Number(record?.target?.id ?? 0),
    verificationEvidenceCount: Array.isArray(record?.verificationEvidence)
      ? record.verificationEvidence.length
      : 0,
  };
}

function gitValue(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function fileSummary(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    length: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

async function jsonRequest(method, urlPath, body) {
  const response = await fetch(`${runtimeUrl}${urlPath}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text.slice(0, 300) };
  }
  if (!response.ok) {
    throw new Error(`${method} ${urlPath} failed (${response.status}): ${String(parsed.error ?? "unknown error")}`);
  }
  return parsed;
}

async function cdpVersion() {
  try {
    const response = await fetch(`${cdpBaseUrl}/json/version`, {
      signal: AbortSignal.timeout(750),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function runtimeHealth() {
  try {
    const response = await fetch(`${runtimeUrl}/healthz`, {
      signal: AbortSignal.timeout(750),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function waitFor(getValue, description, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await getValue();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // The process may have exited between the check and taskkill.
    }
  }
}

async function stopOwnedInstalledSidecar() {
  const health = await runtimeHealth();
  if (!health) return;
  const actualPath = path.resolve(String(health.execPath ?? "")).toLowerCase();
  const expectedPath = path.resolve(installedDaemon).toLowerCase();
  assert(actualPath === expectedPath, `refusing to stop unexpected runtime owner: ${actualPath}`);
  const pid = Number(health.pid ?? 0);
  assert(Number.isSafeInteger(pid) && pid > 0, "installed sidecar health has no valid pid");
  try {
    process.kill(pid);
  } catch {
    // It may have exited after the health read.
  }
  await waitFor(async () => (await runtimeHealth()) ? null : true, "installed sidecar shutdown", 10_000);
}

async function readWorkItemDetail(projectLinkId) {
  const result = await jsonRequest(
    "GET",
    `/delivery/work-items/${fixtureWorkItemId}?projectLinkId=${encodeURIComponent(projectLinkId)}`,
  );
  return result.workItem;
}

async function assignFixtureToCurrentUser(projectLinkId, currentDetail, userPrincipalName, runId) {
  const proposed = await jsonRequest("POST", "/delivery/actions", {
    turnId: `${runId}-fixture-setup`,
    projectLinkId,
    kind: "work_item.update",
    target: {
      kind: "work_item",
      projectLinkId,
      id: fixtureWorkItemId,
      revision: Number(currentDetail.revision),
    },
    basedOn: [{
      kind: "work_item",
      projectLinkId,
      id: fixtureWorkItemId,
      revision: Number(currentDetail.revision),
    }],
    payload: { fields: { "System.AssignedTo": userPrincipalName } },
    risk: "medium",
    reason: "Assign the recorded MergePilot fixture to the authenticated test user so the installed Work UI can inspect it",
    expectedResult: [{
      artifact: {
        kind: "work_item",
        projectLinkId,
        id: fixtureWorkItemId,
        revision: Number(currentDetail.revision) + 1,
      },
      condition: "revision_gt",
      expectedRevision: Number(currentDetail.revision),
    }],
    idempotencyKey: `${runId}-fixture-assignment`,
    expiresAt: Date.now() + 3_600_000,
  });
  assert(proposed.status === "awaiting_approval", "fixture assignment must wait for approval");
  const approved = await jsonRequest("POST", `/delivery/actions/${encodeURIComponent(proposed.id)}/approve`);
  assert(approved.status === "verified", "fixture assignment must verify after approval");
  return redactedActionEvidence(approved);
}

async function main() {
  assert(process.env.MERGEPILOT_E2E_LIVE_ADO === "1", "set MERGEPILOT_E2E_LIVE_ADO=1 for the real ADO gate");
  assert(process.env.MERGEPILOT_E2E_ALLOW_WRITES === "1", "set MERGEPILOT_E2E_ALLOW_WRITES=1 to authorize fixture writes");
  assert(Number.isSafeInteger(fixtureWorkItemId) && fixtureWorkItemId > 0, "fixture Work Item ID must be positive");
  assert(Number.isSafeInteger(fixturePullRequestId) && fixturePullRequestId > 0, "fixture Pull Request ID must be positive");
  assert(Number.isSafeInteger(fixtureBuildId) && fixtureBuildId > 0, "fixture build ID must be positive");
  assert(fs.existsSync(installedDesktop), `installed desktop not found: ${installedDesktop}`);
  assert(fs.existsSync(installedDaemon), `installed daemon not found: ${installedDaemon}`);
  assert(!(await cdpVersion()), `CDP port ${cdpPort} is already in use`);
  assert(!(await runtimeHealth()), `runtime ${runtimeUrl} is already in use; refusing ambiguous installed evidence`);

  const runId = `installed-loop-${Date.now().toString(36)}`;
  const startedAt = new Date().toISOString();
  const source = {
    sha: gitValue(["rev-parse", "HEAD"]),
    branch: gitValue(["branch", "--show-current"]),
    treeClean: gitValue(["status", "--porcelain"]) === "",
  };
  const steps = [];
  const child = spawn(installedDesktop, [], {
    stdio: "ignore",
    windowsHide: false,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [
        process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS,
        `--remote-debugging-port=${cdpPort}`,
        `--remote-allow-origins=${cdpBaseUrl}`,
      ].filter(Boolean).join(" "),
    },
  });

  let browser;
  try {
    const [version, health] = await Promise.all([
      waitFor(cdpVersion, "installed WebView2 CDP"),
      waitFor(runtimeHealth, "installed desktop sidecar"),
    ]);
    assert(health.version === expectedVersion, `expected installed daemon ${expectedVersion}, got ${health.version}`);
    assert(health.runtimeMode === "desktop-sidecar", `expected desktop-sidecar runtime, got ${health.runtimeMode}`);
    steps.push({
      step: "installed-runtime",
      ok: true,
      daemonVersion: health.version,
      daemonBuildSha: health.buildSha ?? null,
      runtimeMode: health.runtimeMode,
      browser: version.Browser ?? null,
    });

    browser = await chromium.connectOverCDP(cdpBaseUrl);
    const page = await waitFor(() => {
      const pages = browser.contexts().flatMap((context) => context.pages());
      return pages.find((candidate) => candidate.url() !== "about:blank") ?? null;
    }, "installed MergePilot page");
    await page.waitForLoadState("domcontentloaded");
    await page.getByText("Preparing workspace", { exact: true })
      .waitFor({ state: "hidden", timeout: 60_000 });
    assert((await page.title()) === "MergePilot", "installed page title must be MergePilot");

    const auth = await waitFor(async () => {
      try {
        const value = await jsonRequest("GET", "/auth/me");
        return value.authenticated && (value.upn || value.username) ? value : null;
      } catch {
        return null;
      }
    }, "fresh authenticated identity", 90_000);
    const userPrincipalName = String(auth.upn ?? auth.username ?? "");
    assert(userPrincipalName, "authenticated identity has no assignable principal name");
    await page.getByRole("button", { name: /^Account:/ }).waitFor({ state: "visible", timeout: 30_000 });
    steps.push({ step: "auth", ok: true, authenticated: true, accountRendered: true });

    const activeProjectLinkId = await page.evaluate(() =>
      window.localStorage.getItem("mergepilot_active_project_link_id") ?? "",
    );
    assert(activeProjectLinkId, "installed UI Context has no selected Project Link");
    const projectLinks = await jsonRequest("GET", "/project-links");
    const projectLink = selectClaimBotProjectLink(projectLinks, activeProjectLinkId);
    const projectLinkId = String(projectLink.id ?? "");
    assert(projectLinkId, "ClaimBot_API Project Link has no id");

    const beforeSetup = await readWorkItemDetail(projectLinkId);
    const coverage = fixtureCoverage(beforeSetup);
    const fixtureSetup = await assignFixtureToCurrentUser(
      projectLinkId,
      beforeSetup,
      userPrincipalName,
      runId,
    );
    steps.push({ step: "fixture-assignment", ok: true, action: fixtureSetup });

    await page.getByRole("link", { name: "Work", exact: true }).click();
    await page.waitForFunction(() => window.location.hash.toLowerCase().includes("/work"));
    await page.getByText(`Project Link: ${String(projectLink.name)} (selected in Context)`, { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    const workItemButton = page.getByRole("button", {
      name: new RegExp(`^Open work item #${fixtureWorkItemId}:`),
    });
    await workItemButton.waitFor({ state: "visible", timeout: 90_000 });

    const detailResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET"
      && response.url().includes(`/delivery/work-items/${fixtureWorkItemId}?`),
    );
    await workItemButton.click();
    const detailResponse = await detailResponsePromise;
    assert(detailResponse.ok(), `installed UI detail read failed (${detailResponse.status()})`);
    const uiDetailPayload = await detailResponse.json();
    const uiCoverage = fixtureCoverage(uiDetailPayload.workItem);
    await page.getByText("Linked pull requests", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Builds", { exact: true }).waitFor({ state: "visible" });
    await page.getByText(new RegExp(`#${fixturePullRequestId}\\b`)).waitFor({ state: "visible" });
    steps.push({
      step: "installed-ui-read",
      ok: true,
      route: "#/work",
      projectLinkSelected: true,
      coverage: uiCoverage,
    });

    const commentText = `[MergePilot Fixture] installed UI verified write-back ${runId}`;
    const commentHash = crypto.createHash("sha256").update(commentText).digest("hex");
    await page.getByRole("button", { name: "Add update", exact: true }).click();
    await page.getByLabel("Verified update", { exact: true }).fill(commentText);

    const proposalResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/delivery/actions",
    );
    await page.getByRole("button", { name: "Request approval", exact: true }).click();
    const proposalResponse = await proposalResponsePromise;
    assert(proposalResponse.status() === 201, `installed UI proposal failed (${proposalResponse.status()})`);
    const proposal = await proposalResponse.json();
    assert(proposal.kind === "work_item.comment", "installed UI must propose a Work Item comment");
    assert(proposal.status === "awaiting_approval", "proposal must remain awaiting approval");
    assert(Number(proposal.target?.id) === fixtureWorkItemId, "proposal target changed from the fixture");
    await page.getByText("Review before running", { exact: true }).waitFor({ state: "visible" });

    const preApprovalRead = await readWorkItemDetail(projectLinkId);
    assert(!(preApprovalRead.comments ?? []).includes(commentText), "comment appeared before explicit approval");
    steps.push({
      step: "installed-ui-proposal",
      ok: true,
      action: redactedActionEvidence(proposal),
      commentHash,
      remoteUnchangedBeforeApproval: true,
    });

    const approvalResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === `/delivery/actions/${proposal.id}/approve`,
    );
    await page.getByRole("button", { name: "Approve and run", exact: true }).click();
    const approvalResponse = await approvalResponsePromise;
    assert(approvalResponse.ok(), `installed UI approval failed (${approvalResponse.status()})`);
    const approved = await approvalResponse.json();
    assert(approved.status === "verified", "approved installed UI action must be verified");
    await page.getByText("work_item.comment verified against Azure DevOps.", { exact: true })
      .waitFor({ state: "visible", timeout: 60_000 });

    const persisted = await jsonRequest("GET", `/delivery/actions/${encodeURIComponent(proposal.id)}`);
    assert(persisted.status === "verified", "persisted ActionRecord is not verified");
    const afterApproval = await readWorkItemDetail(projectLinkId);
    assert((afterApproval.comments ?? []).includes(commentText), "ADO re-read does not contain the installed UI comment");
    assert(Number(afterApproval.revision) > Number(preApprovalRead.revision), "ADO revision did not advance after write-back");
    steps.push({
      step: "installed-ui-approved-write-back",
      ok: true,
      action: redactedActionEvidence(persisted),
      adoRevisionBefore: Number(preApprovalRead.revision),
      adoRevisionAfter: Number(afterApproval.revision),
      commentHash,
      commentVisibleOnAuthoritativeReread: true,
      uiTerminalStatusVisible: true,
    });

    const evidence = {
      schemaVersion: 1,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "PASS",
      source,
      installed: {
        version: health.version,
        buildSha: health.buildSha ?? null,
        desktop: fileSummary(installedDesktop),
        daemon: fileSummary(installedDaemon),
      },
      fixture: {
        name: "ClaimBot_API",
        ...coverage,
      },
      steps,
      privacy: "No account identity, credential, endpoint, organization URL, repository path, or comment plaintext is stored.",
    };
    const outputDir = path.join(repoRoot, "output", "live-e2e");
    fs.mkdirSync(outputDir, { recursive: true });
    const evidencePath = path.join(outputDir, `installed-vertical-loop-${runId}.json`);
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      status: evidence.status,
      runId,
      source,
      installed: evidence.installed,
      fixture: evidence.fixture,
      steps: steps.map((step) => ({ step: step.step, ok: step.ok })),
      evidencePath,
    }, null, 2)}\n`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await stopProcess(child);
    await stopOwnedInstalledSidecar();
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
