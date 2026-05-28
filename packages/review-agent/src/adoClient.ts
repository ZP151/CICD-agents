import { ClientSecretCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity";

const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798/.default"; // Azure DevOps

export interface AdoClientOptions {
  organization: string;
  /**
   * Optional fallback PAT - used for local dev when no managed identity or
   * service principal is configured.
   */
  pat?: string;
  /** Override the credential entirely (tests). */
  credential?: TokenCredential;
  /** Service principal config (for cloud). */
  spn?: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
  };
}

export class AdoClient {
  private readonly org: string;
  private readonly pat?: string;
  private readonly credential: TokenCredential | null;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(opts: AdoClientOptions) {
    this.org = opts.organization;
    this.pat = opts.pat;
    if (opts.credential) {
      this.credential = opts.credential;
    } else if (opts.spn?.tenantId && opts.spn.clientId && opts.spn.clientSecret) {
      this.credential = new ClientSecretCredential(
        opts.spn.tenantId,
        opts.spn.clientId,
        opts.spn.clientSecret,
      );
    } else {
      try {
        this.credential = new ManagedIdentityCredential();
      } catch {
        this.credential = null;
      }
    }
  }

  private async authHeader(): Promise<string> {
    if (this.pat) return `Basic ${Buffer.from(`:${this.pat}`).toString("base64")}`;
    if (!this.credential) throw new Error("No ADO credential available (no PAT, no SPN, no MI).");
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return `Bearer ${this.cachedToken.token}`;
    }
    const tok = await this.credential.getToken(ADO_RESOURCE);
    if (!tok) throw new Error("Failed to acquire ADO token.");
    this.cachedToken = { token: tok.token, expiresAt: tok.expiresOnTimestamp };
    return `Bearer ${tok.token}`;
  }

  private get baseUrl(): string {
    return `https://dev.azure.com/${this.org}`;
  }

  async getPullRequest(project: string, repositoryId: string, prId: number): Promise<unknown> {
    return this.json(
      `${this.baseUrl}/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${prId}?api-version=7.1-preview.1`,
    );
  }

  async getPullRequestIterations(
    project: string,
    repositoryId: string,
    prId: number,
  ): Promise<{ value: Array<{ id: number; description: string; sourceRefCommit: { commitId: string } }> }> {
    return this.json(
      `${this.baseUrl}/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${prId}/iterations?api-version=7.1-preview.1`,
    );
  }

  async getPullRequestChanges(
    project: string,
    repositoryId: string,
    prId: number,
    iterationId: number,
  ): Promise<{
    changeEntries: Array<{
      changeType: string;
      item: { path: string };
    }>;
  }> {
    return this.json(
      `${this.baseUrl}/${project}/_apis/git/repositories/${repositoryId}/pullrequests/${prId}/iterations/${iterationId}/changes?api-version=7.1-preview.1`,
    );
  }

  async getItemContent(
    project: string,
    repositoryId: string,
    pathInRepo: string,
    branchOrCommit?: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      path: pathInRepo,
      "api-version": "7.1-preview.1",
      "$format": "text",
    });
    if (branchOrCommit) {
      params.set("versionDescriptor.version", branchOrCommit);
      params.set("versionDescriptor.versionType", "commit");
    }
    const url = `${this.baseUrl}/${project}/_apis/git/repositories/${repositoryId}/items?${params.toString()}`;
    const r = await fetch(url, { headers: { Authorization: await this.authHeader() } });
    if (!r.ok) throw new Error(`getItemContent failed: HTTP ${r.status}`);
    return r.text();
  }

  async createThread(args: {
    project: string;
    repositoryId: string;
    pullRequestId: number;
    body: ReviewThreadPayload;
  }): Promise<unknown> {
    const url =
      `${this.baseUrl}/${args.project}/_apis/git/repositories/${args.repositoryId}` +
      `/pullRequests/${args.pullRequestId}/threads?api-version=7.1-preview.1`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: await this.authHeader(),
      },
      body: JSON.stringify(args.body),
    });
    if (!r.ok) {
      throw new Error(`createThread failed: HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`);
    }
    return r.json();
  }

  async approvePullRequest(args: {
    project: string;
    repositoryId: string;
    pullRequestId: number;
    reviewerId: string;
  }): Promise<unknown> {
    const url =
      `${this.baseUrl}/${args.project}/_apis/git/repositories/${args.repositoryId}` +
      `/pullRequests/${args.pullRequestId}/reviewers/${args.reviewerId}?api-version=7.1-preview.1`;
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: await this.authHeader(),
      },
      body: JSON.stringify({ vote: 10, isReapprove: true }),
    });
    if (!r.ok) {
      throw new Error(`approvePullRequest failed: HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`);
    }
    return r.json();
  }

  private async json<T = unknown>(url: string): Promise<T> {
    const r = await fetch(url, { headers: { Authorization: await this.authHeader() } });
    if (!r.ok) throw new Error(`GET ${url} failed: HTTP ${r.status}`);
    return (await r.json()) as T;
  }
}

export interface ReviewThreadPayload {
  comments: Array<{ parentCommentId?: number; content: string; commentType: number }>;
  status: number;
  threadContext?: {
    filePath: string;
    rightFileStart: { line: number; offset: number };
    rightFileEnd: { line: number; offset: number };
  };
}

export const COMMENT_TYPE_TEXT = 1;
// 1=active, 2=fixed, 3=wontFix, 4=closed, 5=byDesign, 6=pending
export const THREAD_STATUS_ACTIVE = 1;
