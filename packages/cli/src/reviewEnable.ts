import { request } from "undici";
import { getSettings } from "@cicd-agent/core";

const PAT_KEYRING_SERVICE = "cicd-agent";
const PAT_KEYRING_USER = "azure-devops-pat";

export interface EnableReviewArgs {
  organization?: string;
  project: string;
  repositoryId: string;
  reviewAgentUrl: string;
  webhookPassword: string;
  events?: Array<"git.pullrequest.created" | "git.pullrequest.updated">;
}

export interface EnabledSubscription {
  id: string;
  eventType: string;
  consumerInputs: Record<string, string>;
}

/**
 * Register one ADO service-hook subscription per event type. The
 * subscriptions push to the review-agent's POST /webhooks/ado/pr endpoint
 * using HTTP Basic auth - the password slot carries the shared secret used
 * by `verifyBasicSecret` on the receiving side.
 */
export async function enableReview(args: EnableReviewArgs): Promise<EnabledSubscription[]> {
  const settings = getSettings();
  const org = args.organization ?? settings.azureDevOpsOrg;
  if (!org) throw new Error("Azure DevOps organization is required.");
  if (!args.project) throw new Error("project is required.");
  if (!args.repositoryId) throw new Error("repositoryId is required.");
  const pat = await loadPat();
  const events = args.events ?? ["git.pullrequest.created", "git.pullrequest.updated"];
  const out: EnabledSubscription[] = [];
  for (const event of events) {
    const body = {
      publisherId: "tfs",
      eventType: event,
      resourceVersion: "1.0",
      consumerId: "webHooks",
      consumerActionId: "httpRequest",
      publisherInputs: {
        projectId: args.project,
        repository: args.repositoryId,
      },
      consumerInputs: {
        url: args.reviewAgentUrl.replace(/\/$/, "") + "/webhooks/ado/pr",
        basicAuthUsername: "review-agent",
        basicAuthPassword: args.webhookPassword,
      },
    };
    const url = `https://dev.azure.com/${org}/_apis/hooks/subscriptions?api-version=7.1-preview.1`;
    const resp = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      const text = await resp.body.text();
      throw new Error(`ADO subscription failed: HTTP ${resp.statusCode}: ${text.slice(0, 400)}`);
    }
    const data = (await resp.body.json()) as {
      id?: string;
      eventType?: string;
      consumerInputs?: Record<string, string>;
    };
    out.push({
      id: String(data.id ?? ""),
      eventType: String(data.eventType ?? event),
      consumerInputs: data.consumerInputs ?? {},
    });
  }
  return out;
}

async function loadPat(): Promise<string> {
  const keytarMod = await import("keytar");
  const keytar = keytarMod.default ?? keytarMod;
  const pat = (await keytar.getPassword(PAT_KEYRING_SERVICE, PAT_KEYRING_USER)) ?? "";
  if (!pat) {
    throw new Error("Azure DevOps PAT not configured. Run `dev-agent configure-pat`.");
  }
  return pat;
}
