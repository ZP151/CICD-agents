param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$WorkflowPath = "",
  [switch]$RequireTrackedScripts
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkflowPath)) {
  $WorkflowPath = Join-Path $Root ".github\workflows\release.yml"
}

$nodePath = Join-Path $Root ".tools\node-v22.11.0-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Repository-local Node.js was not found: $nodePath"
}

$yamlModulePath = @(
  (Join-Path $Root "packages\core\node_modules\yaml"),
  (Join-Path $Root "packages\cli\node_modules\yaml")
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($yamlModulePath)) {
  throw "The local yaml package was not found under packages/core or packages/cli. Run pnpm install first."
}

if (-not (Test-Path -LiteralPath $WorkflowPath)) {
  throw "Release workflow was not found: $WorkflowPath"
}

$previousWorkflowPath = $env:MERGEPILOT_RELEASE_WORKFLOW_PATH
$previousYamlModulePath = $env:MERGEPILOT_YAML_MODULE_PATH
$previousRoot = $env:MERGEPILOT_REPO_ROOT
$previousRequireTrackedScripts = $env:MERGEPILOT_REQUIRE_TRACKED_RELEASE_SCRIPTS
$env:MERGEPILOT_RELEASE_WORKFLOW_PATH = (Resolve-Path $WorkflowPath).Path
$env:MERGEPILOT_YAML_MODULE_PATH = (Resolve-Path $yamlModulePath).Path
$env:MERGEPILOT_REPO_ROOT = (Resolve-Path $Root).Path
$env:MERGEPILOT_REQUIRE_TRACKED_RELEASE_SCRIPTS = if ($RequireTrackedScripts) { "1" } else { "0" }

try {
  $script = @'
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const YAML = require(process.env.MERGEPILOT_YAML_MODULE_PATH);

const workflowPath = process.env.MERGEPILOT_RELEASE_WORKFLOW_PATH;
const repoRoot = process.env.MERGEPILOT_REPO_ROOT;
const requireTrackedScripts = process.env.MERGEPILOT_REQUIRE_TRACKED_RELEASE_SCRIPTS === "1";
const doc = YAML.parse(fs.readFileSync(workflowPath, "utf8"));
const failures = [];

function fail(message) {
  failures.push(message);
}

function get(path, root = doc) {
  return path.reduce((value, key) => value?.[key], root);
}

const buildJob = get(["jobs", "build-installer"]);
const releaseJob = get(["jobs", "create-release"]);
if (!buildJob) fail("Missing build-installer job.");
if (!releaseJob) fail("Missing create-release job.");

const steps = Array.isArray(buildJob?.steps) ? buildJob.steps : [];
const names = steps.map((step) => step.name || step.uses || "");
const idx = (name) => names.indexOf(name);
const findStep = (name) => steps.find((step) => step.name === name);

const requiredSteps = [
  "Install dependencies",
  "Build packages",
  "Build daemon sidecar",
  "Clean stale installer artifacts",
  "Build Tauri installer",
  "Verify removed chat templates",
  "Verify Windows installer metadata",
  "Detect Windows signing configuration",
  "Verify Windows signing readiness",
  "Sign Windows installers",
  "Verify Windows installer signatures",
  "Report unsigned Windows installers",
  "Upload installer artifacts",
];
for (const name of requiredSteps) {
  if (idx(name) < 0) fail(`Missing release step: ${name}`);
}

const requiredScripts = [
  "scripts\\windows\\verify-no-stale-chat-template.ps1",
  "scripts\\windows\\verify-windows-installer-metadata.ps1",
  "scripts\\windows\\verify-windows-signing-readiness.ps1",
  "scripts\\windows\\sign-windows-release-artifacts.ps1",
  "scripts\\windows\\verify-windows-artifact-signatures.ps1",
];
for (const scriptPath of requiredScripts) {
  const absoluteScriptPath = path.join(repoRoot, scriptPath);
  if (!fs.existsSync(absoluteScriptPath)) {
    fail(`Release workflow script is missing: ${scriptPath}`);
    continue;
  }
  if (requireTrackedScripts) {
    try {
      childProcess.execFileSync("git", ["-C", repoRoot, "ls-files", "--error-unmatch", scriptPath.replace(/\\/g, "/")], {
        stdio: "ignore",
      });
    } catch {
      fail(`Release workflow script is not tracked by Git: ${scriptPath}`);
    }
  }
}

const signingReadinessPath = path.join(repoRoot, "scripts\\windows\\verify-windows-signing-readiness.ps1");
if (fs.existsSync(signingReadinessPath)) {
  const signingReadinessSource = fs.readFileSync(signingReadinessPath, "utf8");
  if (!signingReadinessSource.includes('probe = "tcp_connect"')) {
    fail("Signing readiness must report the TCP timestamp probe mode.");
  }
  if (signingReadinessSource.includes("Invoke-WebRequest -Uri $TimestampUrl -Method Head")) {
    fail("Signing readiness must not probe RFC3161 timestamp servers with HTTP HEAD.");
  }
}

if (idx("Clean stale installer artifacts") > idx("Build Tauri installer")) {
  fail("Clean stale installer artifacts must run before Build Tauri installer.");
}
if (idx("Sign Windows installers") < idx("Build Tauri installer")) {
  fail("Sign Windows installers must run after Build Tauri installer.");
}
if (idx("Verify Windows installer metadata") < idx("Build Tauri installer")) {
  fail("Verify Windows installer metadata must run after Build Tauri installer.");
}
if (idx("Verify removed chat templates") < idx("Build Tauri installer")) {
  fail("Verify removed chat templates must run after Build Tauri installer.");
}
if (idx("Verify Windows installer metadata") < idx("Verify removed chat templates")) {
  fail("Verify Windows installer metadata must run after Verify removed chat templates.");
}
if (idx("Sign Windows installers") < idx("Verify Windows installer metadata")) {
  fail("Sign Windows installers must run after Verify Windows installer metadata.");
}
if (idx("Verify Windows signing readiness") < idx("Verify Windows installer metadata")) {
  fail("Verify Windows signing readiness must run after Verify Windows installer metadata.");
}
if (idx("Detect Windows signing configuration") < idx("Verify Windows installer metadata")) {
  fail("Detect Windows signing configuration must run after Verify Windows installer metadata.");
}
if (idx("Verify Windows signing readiness") < idx("Detect Windows signing configuration")) {
  fail("Verify Windows signing readiness must run after Detect Windows signing configuration.");
}
if (idx("Sign Windows installers") < idx("Verify Windows signing readiness")) {
  fail("Sign Windows installers must run after Verify Windows signing readiness.");
}
if (idx("Verify Windows installer signatures") < idx("Sign Windows installers")) {
  fail("Verify Windows installer signatures must run after Sign Windows installers.");
}
if (idx("Report unsigned Windows installers") < idx("Verify Windows installer signatures")) {
  fail("Report unsigned Windows installers must run after Verify Windows installer signatures.");
}
if (idx("Upload installer artifacts") < idx("Verify Windows installer signatures")) {
  fail("Upload installer artifacts must run after signature verification.");
}
if (idx("Upload installer artifacts") < idx("Report unsigned Windows installers")) {
  fail("Upload installer artifacts must run after unsigned Windows artifact reporting.");
}

const matrixOs = get(["strategy", "matrix", "os"], buildJob);
if (!Array.isArray(matrixOs) || !matrixOs.includes("windows-latest") || !matrixOs.includes("macos-latest")) {
  fail("build-installer matrix must include windows-latest and macos-latest.");
}

const clean = findStep("Clean stale installer artifacts");
if (clean?.shell !== "bash") fail("Clean stale installer artifacts should use bash.");
if (!String(clean?.run || "").includes("apps/desktop/src-tauri/target/release/bundle")) {
  fail("Clean stale installer artifacts must remove the Tauri bundle output directory.");
}

const sign = findStep("Sign Windows installers");
if (!String(sign?.if || "").includes("matrix.os == 'windows-latest'")) fail("Sign Windows installers must be gated to windows-latest.");
if (!String(sign?.if || "").includes("steps.windows_signing.outputs.configured == 'true'")) {
  fail("Sign Windows installers must run only when Windows signing secrets are configured.");
}
if (sign?.shell !== "pwsh") fail("Sign Windows installers should use pwsh.");
if (!String(sign?.run || "").includes("scripts\\windows\\sign-windows-release-artifacts.ps1")) {
  fail("Sign Windows installers must call scripts\\windows\\sign-windows-release-artifacts.ps1.");
}
if (get(["env", "WINDOWS_CODESIGN_CERT_PFX_BASE64"], sign) !== "${{ secrets.WINDOWS_CODESIGN_CERT_PFX_BASE64 }}") {
  fail("Sign Windows installers must read WINDOWS_CODESIGN_CERT_PFX_BASE64 from repository secrets.");
}
if (get(["env", "WINDOWS_CODESIGN_CERT_PASSWORD"], sign) !== "${{ secrets.WINDOWS_CODESIGN_CERT_PASSWORD }}") {
  fail("Sign Windows installers must read WINDOWS_CODESIGN_CERT_PASSWORD from repository secrets.");
}

const metadata = findStep("Verify Windows installer metadata");
if (metadata?.if !== "matrix.os == 'windows-latest'") fail("Verify Windows installer metadata must be gated to windows-latest.");
if (metadata?.shell !== "pwsh") fail("Verify Windows installer metadata should use pwsh.");
if (!String(metadata?.run || "").includes("scripts\\windows\\verify-windows-installer-metadata.ps1")) {
  fail("Verify Windows installer metadata must call scripts\\windows\\verify-windows-installer-metadata.ps1.");
}

const signingReadiness = findStep("Verify Windows signing readiness");
if (!String(signingReadiness?.if || "").includes("matrix.os == 'windows-latest'")) fail("Verify Windows signing readiness must be gated to windows-latest.");
if (!String(signingReadiness?.if || "").includes("steps.windows_signing.outputs.configured == 'true'")) {
  fail("Verify Windows signing readiness must run only when Windows signing secrets are configured.");
}
if (signingReadiness?.shell !== "pwsh") fail("Verify Windows signing readiness should use pwsh.");
if (!String(signingReadiness?.run || "").includes("scripts\\windows\\verify-windows-signing-readiness.ps1")) {
  fail("Verify Windows signing readiness must call scripts\\windows\\verify-windows-signing-readiness.ps1.");
}
if (get(["env", "WINDOWS_CODESIGN_CERT_PFX_BASE64"], signingReadiness) !== "${{ secrets.WINDOWS_CODESIGN_CERT_PFX_BASE64 }}") {
  fail("Verify Windows signing readiness must read WINDOWS_CODESIGN_CERT_PFX_BASE64 from repository secrets.");
}
if (get(["env", "WINDOWS_CODESIGN_CERT_PASSWORD"], signingReadiness) !== "${{ secrets.WINDOWS_CODESIGN_CERT_PASSWORD }}") {
  fail("Verify Windows signing readiness must read WINDOWS_CODESIGN_CERT_PASSWORD from repository secrets.");
}

const staleTemplates = findStep("Verify removed chat templates");
if (staleTemplates?.if !== "matrix.os == 'windows-latest'") fail("Verify removed chat templates must be gated to windows-latest.");
if (staleTemplates?.shell !== "pwsh") fail("Verify removed chat templates should use pwsh.");
if (!String(staleTemplates?.run || "").includes("scripts\\windows\\verify-no-stale-chat-template.ps1")) {
  fail("Verify removed chat templates must call scripts\\windows\\verify-no-stale-chat-template.ps1.");
}

const verify = findStep("Verify Windows installer signatures");
if (!String(verify?.if || "").includes("matrix.os == 'windows-latest'")) fail("Verify Windows installer signatures must be gated to windows-latest.");
if (!String(verify?.if || "").includes("steps.windows_signing.outputs.configured == 'true'")) {
  fail("Verify Windows installer signatures must run only when Windows signing secrets are configured.");
}
if (verify?.shell !== "pwsh") fail("Verify Windows installer signatures should use pwsh.");
if (!String(verify?.run || "").includes("scripts\\windows\\verify-windows-artifact-signatures.ps1")) {
  fail("Verify Windows installer signatures must call scripts\\windows\\verify-windows-artifact-signatures.ps1.");
}

const signingConfig = findStep("Detect Windows signing configuration");
if (signingConfig?.if !== "matrix.os == 'windows-latest'") fail("Detect Windows signing configuration must be gated to windows-latest.");
if (signingConfig?.shell !== "pwsh") fail("Detect Windows signing configuration should use pwsh.");
if (!String(signingConfig?.run || "").includes("configured=")) {
  fail("Detect Windows signing configuration must expose a configured output.");
}
if (get(["env", "WINDOWS_CODESIGN_CERT_PFX_BASE64"], signingConfig) !== "${{ secrets.WINDOWS_CODESIGN_CERT_PFX_BASE64 }}") {
  fail("Detect Windows signing configuration must read WINDOWS_CODESIGN_CERT_PFX_BASE64 from repository secrets.");
}
if (get(["env", "WINDOWS_CODESIGN_CERT_PASSWORD"], signingConfig) !== "${{ secrets.WINDOWS_CODESIGN_CERT_PASSWORD }}") {
  fail("Detect Windows signing configuration must read WINDOWS_CODESIGN_CERT_PASSWORD from repository secrets.");
}

const unsignedReport = findStep("Report unsigned Windows installers");
if (!String(unsignedReport?.if || "").includes("matrix.os == 'windows-latest'")) fail("Report unsigned Windows installers must be gated to windows-latest.");
if (!String(unsignedReport?.if || "").includes("steps.windows_signing.outputs.configured != 'true'")) {
  fail("Report unsigned Windows installers must run only when Windows signing secrets are absent.");
}
if (unsignedReport?.shell !== "pwsh") fail("Report unsigned Windows installers should use pwsh.");
if (!String(unsignedReport?.run || "").includes("Unsigned Windows artifact")) {
  fail("Report unsigned Windows installers must clearly label unsigned artifacts.");
}

const upload = findStep("Upload installer artifacts");
if (upload?.with?.["if-no-files-found"] !== "error") {
  fail("Upload installer artifacts must use if-no-files-found: error.");
}
const uploadPath = String(upload?.with?.path || "");
for (const pattern of ["**/*.msi", "**/*.exe", "**/*.dmg"]) {
  if (!uploadPath.includes(pattern)) fail(`Upload installer artifacts path must include ${pattern}.`);
}

if (releaseJob?.needs !== "build-installer") fail("create-release must depend on build-installer.");
if (get(["permissions", "contents"], releaseJob) !== "write") fail("create-release must request contents: write.");
const releaseSteps = Array.isArray(releaseJob?.steps) ? releaseJob.steps : [];
if (!releaseSteps.some((step) => step.uses === "actions/download-artifact@v4")) {
  fail("create-release must download installer artifacts.");
}
if (!releaseSteps.some((step) => step.uses === "softprops/action-gh-release@v2")) {
  fail("create-release must use softprops/action-gh-release@v2.");
}

const result = {
  ok: failures.length === 0,
  workflowPath,
  buildSteps: names,
  matrixOs,
  failures,
};
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);
'@

  $script | & $nodePath -
  exit $LASTEXITCODE
} finally {
  if ($null -eq $previousWorkflowPath) {
    Remove-Item Env:\MERGEPILOT_RELEASE_WORKFLOW_PATH -ErrorAction SilentlyContinue
  } else {
    $env:MERGEPILOT_RELEASE_WORKFLOW_PATH = $previousWorkflowPath
  }

  if ($null -eq $previousYamlModulePath) {
    Remove-Item Env:\MERGEPILOT_YAML_MODULE_PATH -ErrorAction SilentlyContinue
  } else {
    $env:MERGEPILOT_YAML_MODULE_PATH = $previousYamlModulePath
  }

  if ($null -eq $previousRoot) {
    Remove-Item Env:\MERGEPILOT_REPO_ROOT -ErrorAction SilentlyContinue
  } else {
    $env:MERGEPILOT_REPO_ROOT = $previousRoot
  }

  if ($null -eq $previousRequireTrackedScripts) {
    Remove-Item Env:\MERGEPILOT_REQUIRE_TRACKED_RELEASE_SCRIPTS -ErrorAction SilentlyContinue
  } else {
    $env:MERGEPILOT_REQUIRE_TRACKED_RELEASE_SCRIPTS = $previousRequireTrackedScripts
  }
}
