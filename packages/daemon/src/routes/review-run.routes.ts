import type { FastifyInstance } from "fastify";
import {
  adoAuthDiagnosticFromError,
  AdoClient,
  buildCloudContext,
  decideReviewOutcome,
  DEFAULT_AUTO_APPROVAL_POLICY,
  FileStateStore,
  getAzureDevOpsAuth,
  LLMClient,
  runReviewPlanner,
} from "@mergepilot/core";
import { extractAdoOrg } from "../adoThreadLinks.js";
import type { InlineProjectLink } from "../chatSession.js";
import {
  categoriesFromReviewFindings,
  enrichBundleWithPrSignals,
  inlineProjectLinkFromReviewRunPayload,
  ProjectLinkIdParam,
  readinessFromDecision,
  resolveReviewRunProjectLink,
  ReviewRunSchema,
  sendAdoDiagnostic,
  type ReviewRunRouteDependencies,
} from "./reviewRunRouteSupport.js";

function registerReviewRunRouteSet(
  app: FastifyInstance,
  prefix: "/project-links",
  { settings, projectLinkStore, buildReviewLlmSettings }: ReviewRunRouteDependencies,
): void {
  app.post(`${prefix}/:id/review-run`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewRunSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const { pullRequestId, targetBranch: bodyTargetBranch, llmConfig } = parsedBody.data;
    const inlineProjectLink = inlineProjectLinkFromReviewRunPayload(parsedBody.data);
    const projectLinkData = await resolveReviewRunProjectLink(
      projectLinkStore,
      parsedId.data.id,
      inlineProjectLink as InlineProjectLink | undefined,
    );
    if (!projectLinkData) return reply.code(404).send({ error: "project_link_not_found" });
    if (!projectLinkData.adoOrgUrl || !projectLinkData.adoProject || !projectLinkData.adoRepoName) {
      return reply.code(400).send({ error: "ado_project_link_incomplete" });
    }

    const org = extractAdoOrg(projectLinkData.adoOrgUrl);
    const authMode = projectLinkData.adoPat ? "pat" : "oauth";
    const ado = new AdoClient({
      organization: org,
      authHeaderProvider: async () => (await getAzureDevOpsAuth(projectLinkData.adoPat)).header,
    });
    const stateStore = new FileStateStore(settings.dataDir);
    const effectiveSettings = buildReviewLlmSettings(llmConfig);
    const llm = new LLMClient(effectiveSettings);

    let iter: { value: Array<{
      id: number;
      sourceRefCommit: { commitId: string };
      commonRefCommit?: { commitId: string };
      targetRefCommit?: { commitId: string };
    }> };
    try {
      iter = await ado.getPullRequestIterations(projectLinkData.adoProject, projectLinkData.adoRepoName, pullRequestId);
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, authMode);
      if (diagnostic.status !== "unknown_error") return sendAdoDiagnostic(reply, err, authMode);
      return reply.code(400).send({ error: `ADO error: ${err instanceof Error ? err.message : String(err)}` });
    }

    const latest = iter.value[iter.value.length - 1];
    if (!latest) return reply.code(400).send({ error: "no iterations found for this PR" });

    const sourceCommit = (latest.sourceRefCommit as { commitId?: string })?.commitId ?? "";
    const baseCommit = (latest.commonRefCommit as { commitId?: string } | undefined)?.commitId
      ?? (latest.targetRefCommit as { commitId?: string } | undefined)?.commitId
      ?? "";
    const repository = projectLinkData.adoRepoName.trim();
    const conventions = await stateStore.listConventions(repository);

    let bundle: Awaited<ReturnType<typeof buildCloudContext>>;
    try {
      bundle = await buildCloudContext({
        ado,
        project: projectLinkData.adoProject,
        repositoryId: repository,
        prId: pullRequestId,
        iterationId: latest.id,
        sourceCommit,
        baseCommit,
        maxFiles: 40,
      });
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, authMode);
      if (diagnostic.status !== "unknown_error") return sendAdoDiagnostic(reply, err, authMode);
      return reply.code(400).send({ error: `context error: ${err instanceof Error ? err.message : String(err)}` });
    }

    try {
      bundle = await enrichBundleWithPrSignals({
        projectLink: projectLinkData,
        repository,
        pullRequestId,
        bundle,
      });
    } catch (err) {
      app.log.warn({ err }, "could not enrich review context with ADO PR signals");
    }

    const review = await runReviewPlanner({ llm, bundle, conventions });
    const policyTargetBranch = projectLinkData.targetBranch || "main";
    const effectiveTargetBranch = bodyTargetBranch || policyTargetBranch;
    let reviewer: Awaited<ReturnType<typeof ado.getAuthenticatedUser>> | null = null;
    try {
      reviewer = await ado.getAuthenticatedUser();
    } catch (err) {
      app.log.warn({ err }, "could not resolve ADO reviewer identity for auto-approval");
    }

    let decision = decideReviewOutcome({
      policy: {
        ...DEFAULT_AUTO_APPROVAL_POLICY,
        enabled: settings.reviewAutoApproveEnabled,
        reviewerId: reviewer?.id ?? "",
        allowedTargetBranches: [policyTargetBranch],
      },
      targetBranch: effectiveTargetBranch,
      changedFiles: bundle.files,
      findings: review.findings,
      reviewUsedLlm: review.tokensIn > 0 || review.tokensOut > 0,
      discardedFindingCount: review.discardedFindings.length,
      hunkCoverageFiles: review.coverage.filesWithHunks,
      wholeFileFallbackFiles: review.coverage.wholeFileOnlyFiles,
      changedHunkLines: review.coverage.changedHunkLines,
    });

    const now = new Date().toISOString();
    const autoApprovalActor = reviewer?.uniqueName || reviewer?.displayName || reviewer?.id || "";
    if (decision.autoApprove && reviewer) {
      try {
        await ado.approvePullRequest({
          project: projectLinkData.adoProject,
          repositoryId: repository,
          pullRequestId,
          reviewerId: reviewer.id,
        });
      } catch (err) {
        decision = {
          queue: "needs_human_review",
          riskLevel: decision.riskLevel,
          autoApprove: false,
          contextConfidence: decision.contextConfidence,
          reason: `Auto-approval failed: ${err instanceof Error ? err.message : String(err)}`,
          reasonCodes: [...decision.reasonCodes, "auto_approval.failed"],
        };
      }
    }

    await stateStore.upsertHistory({
      partitionKey: repository,
      rowKey: String(pullRequestId),
      lastIterationId: latest.id,
      findingCount: review.findings.length,
      lastRunAt: now,
      sourceCommit,
      decisionQueue: decision.queue,
      decisionRiskLevel: decision.riskLevel,
      decisionReason: decision.reason,
      decisionReasonCodes: decision.reasonCodes,
      contextConfidence: decision.contextConfidence,
      autoApprovedAt: decision.autoApprove ? now : "",
      autoApprovalActor: decision.autoApprove ? autoApprovalActor : "",
      lastTokensIn: review.tokensIn,
      lastTokensOut: review.tokensOut,
      discardedFindingCount: review.discardedFindings.length,
      hunkCoverageFiles: review.coverage.filesWithHunks,
      wholeFileFallbackFiles: review.coverage.wholeFileOnlyFiles,
      changedHunkLines: review.coverage.changedHunkLines,
      manualDisposition: "",
      manualDispositionAt: "",
      manualDispositionActor: "",
      manualDispositionNote: "",
      manualDispositionEvents: [],
      manualDispositionWriteBackAttempted: false,
      manualDispositionWriteBackOk: false,
      manualDispositionWriteBackError: "",
      manualDispositionWriteBackAt: "",
      manualDispositionWriteBackThreadId: "",
      manualDispositionWriteBackUrl: "",
      manualDispositionWriteBackEvents: [],
    });

    return {
      ok: true,
      pullRequestId,
      repository,
      iterationId: latest.id,
      findingCount: review.findings.length,
      decisionQueue: decision.queue,
      decisionRiskLevel: decision.riskLevel,
      decisionReason: decision.reason,
      decisionReasonCodes: decision.reasonCodes,
      contextConfidence: decision.contextConfidence,
      readiness: readinessFromDecision(decision.queue),
      categories: categoriesFromReviewFindings(review.findings),
      lastRunAt: now,
      autoApprovalActor: decision.autoApprove ? autoApprovalActor : "",
      tokensIn: review.tokensIn,
      tokensOut: review.tokensOut,
      summary: review.summary,
      findings: review.findings,
      discardedFindings: review.discardedFindings,
      metadata: review.metadata,
      compression: review.compression,
      coverage: review.coverage,
    };
  });
}

export function registerReviewRunRoutes(
  app: FastifyInstance,
  dependencies: ReviewRunRouteDependencies,
): void {
  registerReviewRunRouteSet(app, "/project-links", dependencies);
}
