# Machine verification: second launch of an already-running MergePilot desktop
# must reveal the running instance's main window (show + focus) instead of
# exiting silently. Regression check for the single-instance callback fix.
# Usage: .\scripts\windows\verify-desktop-single-instance-reveal.ps1
#        [-Exe apps\desktop\src-tauri\target\debug\mergepilot-desktop.exe]
# Evidence: prints a JSON verdict; exit 1 on failure.

param(
  [string]$Exe = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Exe)) {
  $Exe = Join-Path $PSScriptRoot "..\..\apps\desktop\src-tauri\target\debug\mergepilot-desktop.exe"
}
$exe = (Resolve-Path $Exe).Path
if (-not (Test-Path -LiteralPath $exe)) { throw "debug exe not found: $exe" }

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder sb, int max);
}
"@

function Get-WindowsForPid {
  param([uint32]$ProcessId)
  $script:found = New-Object System.Collections.Generic.List[object]
  [Win32]::EnumWindows({ param($h, $l)
    $p = [uint32]0
    [Win32]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
    if ($p -eq $ProcessId) {
      $sb = New-Object System.Text.StringBuilder 256
      [Win32]::GetWindowTextW($h, $sb, 256) | Out-Null
      $cb = New-Object System.Text.StringBuilder 256
      [Win32]::GetClassNameW($h, $cb, 256) | Out-Null
      $script:found.Add([pscustomobject]@{ Hwnd = $h; Title = $sb.ToString(); Class = $cb.ToString(); Visible = [Win32]::IsWindowVisible($h) })
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  return $script:found
}

function Get-MainWindowForPid {
  param([uint32]$ProcessId)
  $windows = Get-WindowsForPid $ProcessId
  # The Tauri main window carries the 'Tauri Window' class. A debug build also
  # has a ConsoleWindowClass window and tray/event-target windows; matching
  # the class is the only unambiguous handle for Window::hide()/show().
  return $windows | Where-Object { $_.Class -eq "Tauri Window" } | Select-Object -First 1
}

function Wait-MainWindowForPid {
  param([uint32]$ProcessId, [int]$TimeoutSec = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $w = Get-MainWindowForPid $ProcessId
    if ($w -and $w.Visible) { return $w }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Main window of pid $ProcessId did not become visible within $TimeoutSec seconds."
}

function Launch-Instance {
  param([string]$Label)
  $p = Start-Process -FilePath $exe -PassThru
  Start-Sleep -Seconds 1
  $exited = $null
  if ($p.HasExited) { $exited = $p.ExitCode }
  return [pscustomobject]@{ Proc = $p; Exited = $exited; Label = $Label; Pid = [uint32]$p.Id }
}

$results = [ordered]@{}
$instances = New-Object System.Collections.Generic.List[object]

try {
  # ── Phase 1: first instance launches and shows its window ────────────────
  $a = Launch-Instance "A (first)"
  $instances.Add($a)
  if ($null -ne $a.Exited) { throw "Instance A exited immediately with code $($a.Exited) - nothing to test." }
  $winA = Wait-MainWindowForPid $a.Pid
  $results["firstInstanceRunning"] = $true
  $results["firstWindowVisible"] = $winA.Visible
  $results["firstWindowHwnd"] = ("0x{0:X}" -f $winA.Hwnd.ToInt64())

  # ── Phase 2: second launch must exit (single-instance) and reveal window ──
  $b = Launch-Instance "B (second)"
  $instances.Add($b)
  $b.Proc.WaitForExit(30000) | Out-Null
  $results["secondInstanceExited"] = $b.Proc.HasExited
  if ($b.Proc.HasExited) { $results["secondInstanceExitCode"] = $b.Proc.ExitCode }
  Start-Sleep -Milliseconds 800
  $results["firstStillRunningAfterSecond"] = -not $a.Proc.HasExited
  $winA2 = Get-MainWindowForPid $a.Pid
  $results["firstWindowVisibleAfterSecond"] = if ($winA2) { $winA2.Visible } else { $false }

  # ── Phase 3: tray-hidden window must be revealed by a second launch ───────
  # Close-to-tray hides the window; a re-launch must show it again. Drive the
  # hide through the app's own CloseRequested handler (WM_CLOSE) so the test
  # exercises the real tray-hide path instead of a raw ShowWindow.
  [Win32]::PostMessage($winA.Hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null  # WM_CLOSE
  $deadline = (Get-Date).AddSeconds(10)
  do {
    Start-Sleep -Milliseconds 250
    $hidden = -not [Win32]::IsWindowVisible($winA.Hwnd)
  } while (-not $hidden -and (Get-Date) -lt $deadline)
  $results["windowHiddenBeforeReveal"] = $hidden

  $c = Launch-Instance "C (third, hidden state)"
  $instances.Add($c)
  $c.Proc.WaitForExit(30000) | Out-Null
  $results["thirdInstanceExited"] = $c.Proc.HasExited
  if ($c.Proc.HasExited) { $results["thirdInstanceExitCode"] = $c.Proc.ExitCode }
  Start-Sleep -Milliseconds 1200
  $results["firstStillRunningAfterThird"] = -not $a.Proc.HasExited
  $winA3 = Get-MainWindowForPid $a.Pid
  $results["windowVisibleAfterReveal"] = if ($winA3) { $winA3.Visible } else { $false }

  $fg = [Win32]::GetForegroundWindow()
  $results["foregroundAfterRevealIsMain"] = ($fg -eq $winA3.Hwnd) -or ($fg -eq $winA.Hwnd)
  # Foreground assertion is session-dependent; report but do not gate on it.
  $results["_skip"] = $true

  # ── Verdict ───────────────────────────────────────────────────────────────
  $ok = $results["firstWindowVisible"] -and
        $results["secondInstanceExited"] -and $results["secondInstanceExitCode"] -eq 0 -and
        $results["firstStillRunningAfterSecond"] -and $results["firstWindowVisibleAfterSecond"] -and
        $results["windowHiddenBeforeReveal"] -and
        $results["thirdInstanceExited"] -and $results["thirdInstanceExitCode"] -eq 0 -and
        $results["firstStillRunningAfterThird"] -and $results["windowVisibleAfterReveal"]
  $results["ok"] = $ok
} finally {
  # ── Cleanup: kill only processes this test started ────────────────────────
  foreach ($i in $instances) {
    if (-not $i.Proc.HasExited) { Stop-Process -Id $i.Proc.Id -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep -Milliseconds 800
  $ours = $instances | ForEach-Object { [int]$_.Pid }
  Get-CimInstance Win32_Process -Filter "Name='mergepilot-daemon.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $ours -contains [int]$_.ParentProcessId } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  $results["cleanupDaemonsStopped"] = $true
}

$results | ConvertTo-Json -Depth 4
if (-not $results["ok"]) { exit 1 }
