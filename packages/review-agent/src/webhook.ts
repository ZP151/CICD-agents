import { z } from "zod";

export const AdoPrEventSchema = z.object({
  eventType: z.string(),
  resource: z.object({
    pullRequestId: z.number(),
    status: z.string().optional(),
    title: z.string().optional(),
    sourceRefName: z.string().optional(),
    targetRefName: z.string().optional(),
    repository: z.object({
      id: z.string(),
      name: z.string(),
      project: z.object({ id: z.string(), name: z.string() }).partial(),
    }),
    lastMergeSourceCommit: z.object({ commitId: z.string() }).partial().optional(),
    lastMergeTargetCommit: z.object({ commitId: z.string() }).partial().optional(),
  }),
  message: z.object({ text: z.string().optional() }).partial().optional(),
});

export type AdoPrEvent = z.infer<typeof AdoPrEventSchema>;

export function eventKey(ev: AdoPrEvent): string {
  const prId = ev.resource.pullRequestId;
  const repo = ev.resource.repository.id;
  const commit =
    ev.resource.lastMergeSourceCommit?.commitId ?? ev.resource.lastMergeTargetCommit?.commitId ?? "";
  return `${repo}:${prId}:${commit}`;
}
