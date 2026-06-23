export const RUNTIME_URL = import.meta.env.VITE_RUNTIME_URL ?? "http://127.0.0.1:8787";
export const runtimeUrl = RUNTIME_URL;

export function messageFromErrorBody(fallback: string, body: string): string {
  try {
    const json = JSON.parse(body) as { authMessage?: string; message?: string; error?: string };
    return explainRuntimeError(json.authMessage ?? json.message ?? json.error ?? fallback);
  } catch {
    return explainRuntimeError(body || fallback);
  }
}

export function explainRuntimeError(message: string): string {
  if (/deployment.*does not exist/i.test(message)) {
    const envSource = message.match(/Daemon env source:\s*([^.]*)\./i)?.[1]?.trim();
    const deployment = message.match(/Deployment:\s*([^.]*)\./i)?.[1]?.trim();
    const details = [
      envSource ? `Daemon env source: ${envSource}.` : "",
      deployment ? `Deployment: ${deployment}.` : "",
    ].filter(Boolean).join(" ");
    return `Azure OpenAI deployment not found. ${details} Check Settings -> Additional Models deployment name, endpoint, and API version, or restart the daemon after updating model settings.`.trim();
  }
  return message;
}
