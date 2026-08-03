import type { FastifyInstance } from "fastify";
import {
  loadPersistedUser,
  upsertLocalReviewHistory,
} from "@mergepilot/core";
import { z } from "zod";
import { ReviewDispositionUpsertSchema } from "./review.schemas.js";
import {
  cloudPreferredProjectLink,
  PROJECT_LINK_NOT_FOUND,
  PROJECT_LINK_REPOSITORY_MISSING,
  reviewHistoryRecord,
  writeDispositionToAdo,
  type ReviewRouteDependencies,
} from "./reviewRouteSupport.js";

const ProjectLinkIdParam = z.object({ id: z.string().min(1) });

export function registerReviewDispositionRoutes(
  app: FastifyInstance,
  prefix: "/project-links",
  { settings, projectLinkStore }: ReviewRouteDependencies,
): void {
  app.post(`${prefix}/:id/review-disposition`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewDispositionUpsertSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const projectLink = await cloudPreferredProjectLink(settings, projectLinkStore, parsedId.data.id, {
      throwOnAzureAuthFailure: false,
    });
    if (!projectLink) return reply.code(404).send({ error: PROJECT_LINK_NOT_FOUND });
    const repository = projectLink.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: PROJECT_LINK_REPOSITORY_MISSING });

    // MP-009/RA-041: the audit actor must be the real signed-in identity. The
    // daemon never trusts a client-supplied placeholder as the decision actor.
    const persistedUser = loadPersistedUser(settings.dataDir);
    const actor =
      parsedBody.data.manualDispositionActor &&
      parsedBody.data.manualDispositionActor !== "desktop-user"
        ? parsedBody.data.manualDispositionActor
        : persistedUser?.name?.trim() || persistedUser?.upn?.trim() || "desktop-user";

    const record = reviewHistoryRecord(repository, {
      ...parsedBody.data,
      manualDispositionActor: actor,
    });
    let saved = upsertLocalReviewHistory(settings.dataDir, record);
    let adoWriteBack: { attempted: boolean; ok: boolean; error?: string; at?: string; threadId?: string; url?: string } = {
      attempted: false,
      ok: false,
    };
    const shouldWriteBack =
      parsedBody.data.writeBackToAdo &&
      (parsedBody.data.manualDisposition === "changes_requested" || parsedBody.data.manualDisposition === "marked_blocked");
    if (shouldWriteBack) {
      try {
        adoWriteBack = await writeDispositionToAdo({
          projectLink,
          pullRequestId: parsedBody.data.pullRequestId,
          manualDisposition: parsedBody.data.manualDisposition,
          manualDispositionNote: parsedBody.data.manualDispositionNote,
          decisionReason: parsedBody.data.decisionReason,
          manualDispositionActor: actor,
        });
      } catch (err) {
        adoWriteBack = {
          attempted: true,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          at: new Date().toISOString(),
        };
      }
      saved = upsertLocalReviewHistory(settings.dataDir, {
        ...record,
        manualDispositionWriteBackAttempted: adoWriteBack.attempted,
        manualDispositionWriteBackOk: adoWriteBack.ok,
        manualDispositionWriteBackError: adoWriteBack.error ?? "",
        manualDispositionWriteBackAt: adoWriteBack.at ?? "",
        manualDispositionWriteBackThreadId: adoWriteBack.threadId ?? "",
        manualDispositionWriteBackUrl: adoWriteBack.url ?? "",
        manualDispositionWriteBackEvents: [
          ...(record.manualDispositionWriteBackEvents ?? []),
          {
            disposition: parsedBody.data.manualDisposition,
            at: adoWriteBack.at ?? new Date().toISOString(),
            ok: adoWriteBack.ok,
            actor,
            note: parsedBody.data.manualDispositionNote || parsedBody.data.decisionReason || "",
            error: adoWriteBack.error ?? "",
            threadId: adoWriteBack.threadId ?? "",
            url: adoWriteBack.url ?? "",
          },
        ],
      });
    }

    return { ok: true, record: saved, storage: "local" as const, adoWriteBack };
  });
}
