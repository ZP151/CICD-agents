import { z } from "zod";

export const SubmitPipelineSchema = z.object({
  repoPath: z.string().min(1),
  profile: z.string().default("default"),
  targetBranch: z.string().nullable().optional(),
  workItem: z.union([z.string(), z.number()]).nullable().optional(),
  title: z.string().nullable().optional(),
  draft: z.boolean().default(false),
  autoCreatePr: z.boolean().default(true),
  triggerPipeline: z.boolean().default(false),
});

export type SubmitPipelineInput = z.infer<typeof SubmitPipelineSchema>;

export const TaskIdParam = z.object({ taskId: z.string().min(1) });
