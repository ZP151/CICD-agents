export interface AzureDevOpsDiscoveryOption {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface AzureDevOpsToolHealth {
  ok: boolean;
  source: "internal";
  authMode: "oauth" | "pat";
  authStatus:
    | "ok"
    | "oauth_unavailable"
    | "oauth_no_org_access"
    | "pat_invalid_or_missing_scope"
    | "unknown_error";
  authMessage: string;
  toolCount: number;
  tools: Array<{ name: string; description: string }>;
  projectCount: number;
}
