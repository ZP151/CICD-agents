import { emitReviewMetrics, LLMClient } from "@cicd-agent/core";
import { AdoClient, COMMENT_TYPE_TEXT, THREAD_STATUS_ACTIVE } from "./adoClient.js";
import { buildCloudContext } from "./cloudContext.js";
import { runReviewPlanner } from "./reviewPlanner.js";
import type { StateStore } from "./stateStore.js";
import type { AdoPrEvent } from "./webhook.js";

export interface ReviewServiceOptions {
  ado: AdoClient;
  state: StateStore;
  llm?: LLMClient;
  maxFilesPerPr?: number;
  log?: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void; error: (o: object, m?: string) => void };
}

export class ReviewService {
  constructor(private readonly opts: ReviewServiceOptions) {}

  async handle(ev: AdoPrEvent): Promise<{ status: "reviewed" | "duplicate" | "skipped"; findings?: number }> {
    const project = ev.resource.repository.project?.name ?? "";
    const repoId = ev.resource.repository.id;
    const repoName = ev.resource.repository.name;
    const prId = ev.resource.pullRequestId;
    const ado = this.opts.ado;
    const log = this.opts.log;
    const startedAt = Date.now();

    const iter = await ado.getPullRequestIterations(project, repoId, prId);
    const latest = iter.value[iter.value.length - 1];
    if (!latest) {
      log?.warn({ prId }, "no iterations found, skipping");
      return { status: "skipped" };
    }

    const history = await this.opts.state.getHistory(repoName, prId);
    if (history && history.lastIterationId === latest.id) {
      log?.info({ prId, iteration: latest.id }, "already reviewed this iteration");
      return { status: "duplicate" };
    }

    const sourceCommit = latest.sourceRefCommit?.commitId ?? "";
    const conventions = await this.opts.state.listConventions(repoName);
    const bundle = await buildCloudContext({
      ado,
      project,
      repositoryId: repoId,
      prId,
      iterationId: latest.id,
      sourceCommit,
      maxFiles: this.opts.maxFilesPerPr ?? 40,
    });

    const llm = this.opts.llm ?? new LLMClient();
    const review = await runReviewPlanner({ llm, bundle, conventions });

    if (review.summary || review.findings.length > 0) {
      await ado.createThread({
        project,
        repositoryId: repoId,
        pullRequestId: prId,
        body: {
          status: THREAD_STATUS_ACTIVE,
          comments: [
            {
              content: `**Automated review** (${review.findings.length} finding${review.findings.length === 1 ? "" : "s"})\n\n${review.summary}`,
              commentType: COMMENT_TYPE_TEXT,
            },
          ],
        },
      });
      for (const f of review.findings.slice(0, 20)) {
        await ado.createThread({
          project,
          repositoryId: repoId,
          pullRequestId: prId,
          body: {
            status: THREAD_STATUS_ACTIVE,
            comments: [
              {
                content: `**[${f.severity}/${f.category}]** ${f.message}`,
                commentType: COMMENT_TYPE_TEXT,
              },
            ],
            threadContext: {
              filePath: f.file.startsWith("/") ? f.file : `/${f.file}`,
              rightFileStart: { line: f.line, offset: 1 },
              rightFileEnd: { line: f.line, offset: 1 },
            },
          },
        });
      }
    }

    await this.opts.state.upsertHistory({
      partitionKey: repoName,
      rowKey: String(prId),
      lastIterationId: latest.id,
      findingCount: review.findings.length,
      lastRunAt: new Date().toISOString(),
      lastTokensIn: review.tokensIn,
      lastTokensOut: review.tokensOut,
    });

    log?.info({ prId, findings: review.findings.length }, "review posted");
    void emitReviewMetrics({
      prId,
      repository: repoName,
      findingCount: review.findings.length,
      durationMs: Date.now() - startedAt,
      tokensIn: review.tokensIn,
      tokensOut: review.tokensOut,
      status: "reviewed",
    });
    return { status: "reviewed", findings: review.findings.length };
  }
}
