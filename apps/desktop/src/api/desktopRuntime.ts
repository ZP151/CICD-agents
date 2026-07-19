export interface RuntimePortOwner {
  port: number;
  pid?: number | null;
  path?: string | null;
  commandLine?: string | null;
  recoverable: boolean;
}

export interface RuntimeRecoveryResult {
  ok: boolean;
  port: number;
  stoppedPid?: number | null;
  ownerBefore: RuntimePortOwner;
  ownerAfter: RuntimePortOwner;
}

export async function inspectRuntimePortOwner(): Promise<RuntimePortOwner | null> {
  if (!("__TAURI__" in window)) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<RuntimePortOwner>("inspect_runtime_port_owner");
}

export async function recoverDaemonRuntime(): Promise<RuntimeRecoveryResult> {
  if (!("__TAURI__" in window)) {
    throw new Error("Runtime recovery is only available in the desktop app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<RuntimeRecoveryResult>("recover_daemon_runtime");
}
