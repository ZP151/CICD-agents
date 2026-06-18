import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import open, { apps } from "open";
import { desktopAppName, desktopAppReturnUri } from "./azureAuthConfig.js";
import type { BrowserLoginChoice } from "./azureAuthTypes.js";

export function browserCompletionTemplate(opts: {
  title: string;
  message: string;
  tone?: "success" | "error";
}): string {
  const appName = desktopAppName();
  const returnUri = desktopAppReturnUri();
  const isSuccess = opts.tone !== "error";
  const iconColor = isSuccess ? "#107c41" : "#b42318";
  const iconPath = isSuccess ? "M7.5 12.2 10.7 15.4 17.5 8.6" : "M9 9l6 6m0-6-6 6";
  const autoReturnScript = returnUri
    ? `setTimeout(function(){ window.location.href = ${JSON.stringify(returnUri)}; }, 900);`
    : "";
  const buttonAction = returnUri
    ? `window.location.href = ${JSON.stringify(returnUri)}`
    : "window.close()";
  const helper = returnUri
    ? `If your browser asks for permission, choose Open to return to ${appName}.`
    : `You can close this tab and return to ${appName}.`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", Arial, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f8fb; color: #111827; }
    .card { width: min(520px, calc(100vw - 40px)); border: 1px solid #d8dee8; border-radius: 16px; background: white; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.10); padding: 42px 44px; text-align: center; }
    .mark { width: 72px; height: 72px; margin: 0 auto 24px; border-radius: 999px; background: ${isSuccess ? "#eaf7ef" : "#fff0f0"}; display: grid; place-items: center; }
    svg { width: 38px; height: 38px; }
    h1 { margin: 0; font-size: 25px; line-height: 1.25; font-weight: 700; letter-spacing: 0; }
    p { margin: 14px auto 0; max-width: 380px; color: #5b6472; font-size: 14px; line-height: 1.65; }
    button { margin-top: 28px; border: 1px solid #cfd6e3; border-radius: 999px; background: #111827; color: white; font: inherit; font-size: 14px; font-weight: 600; padding: 11px 18px; cursor: pointer; }
    button:hover { background: #1f2937; }
    .helper { margin-top: 18px; font-size: 12px; color: #7a8494; }
  </style>
</head>
<body>
  <main class="card">
    <div class="mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="${iconPath}" />
      </svg>
    </div>
    <h1>${opts.title}</h1>
    <p>${opts.message}</p>
    <button onclick="${buttonAction}">Return to ${appName}</button>
    <div class="helper">${helper}</div>
  </main>
  <script>
    ${autoReturnScript}
  </script>
</body>
</html>`;
}

export async function openBrowser(url: string, browser: BrowserLoginChoice): Promise<void> {
  if (process.platform === "win32") {
    const exe = findWindowsBrowserExe(browser);
    if (exe) {
      spawn(exe, [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    await open(url);
    return;
  }

  if (browser === "chrome") {
    await open(url, { app: { name: apps.chrome } });
    return;
  }
  if (browser === "edge") {
    await open(url, { app: { name: apps.edge } });
    return;
  }
  await open(url);
}

function findWindowsBrowserExe(browser: BrowserLoginChoice): string | null {
  if (browser === "default") return null;

  const pf = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] ?? "";

  const candidates: string[] =
    browser === "edge"
      ? [
          path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
          path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
      : [
          path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
          path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
          path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
        ];

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}
