import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const MAX_PREVIEW_BYTES = 768 * 1024;

const WorkspaceFileBodySchema = z.object({
  repoPath: z.string().min(1),
  filePath: z.string().min(1),
});

export interface WorkspaceFileResponse {
  path: string;
  content: string;
  size: number;
  lineCount: number;
}

export function registerWorkspaceRoutes(app: FastifyInstance): void {
  app.post("/workspace/file", async (req, reply) => {
    const parsed = WorkspaceFileBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const repoRoot = path.resolve(parsed.data.repoPath);
    const relativePath = normalizeRelativePath(parsed.data.filePath);
    if (!relativePath) return reply.code(400).send({ error: "filePath must be a repository-relative path" });

    const target = path.resolve(repoRoot, relativePath);
    if (!isPathInside(target, repoRoot)) return reply.code(400).send({ error: "filePath escapes repoPath" });

    let realRepoRoot = "";
    let realTarget = "";
    try {
      realRepoRoot = fs.realpathSync.native(repoRoot);
      realTarget = fs.realpathSync.native(target);
    } catch {
      return reply.code(404).send({ error: "file not found" });
    }
    if (!isPathInside(realTarget, realRepoRoot)) return reply.code(400).send({ error: "filePath escapes repoPath" });

    let stat: fs.Stats;
    try {
      stat = fs.statSync(realTarget);
    } catch (err) {
      // MP-008/RA-033: distinguish a missing file from a permission failure
      // instead of one generic 500.
      if ((err as NodeJS.ErrnoException)?.code === "EACCES" || (err as NodeJS.ErrnoException)?.code === "EPERM") {
        return reply.code(403).send({ error: "permission denied reading file" });
      }
      return reply.code(404).send({ error: "file not found" });
    }
    if (!stat.isFile()) return reply.code(400).send({ error: "path is not a file" });
    if (stat.size > MAX_PREVIEW_BYTES) {
      return reply.code(413).send({
        error: "file too large",
        maxBytes: MAX_PREVIEW_BYTES,
        size: stat.size,
      });
    }

    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(realTarget);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "EACCES" || (err as NodeJS.ErrnoException)?.code === "EPERM") {
        return reply.code(403).send({ error: "permission denied reading file" });
      }
      return reply.code(404).send({ error: "file not found" });
    }
    if (buffer.includes(0)) return reply.code(415).send({ error: "binary file preview is not supported" });
    const content = buffer.toString("utf8");
    return reply.send({
      path: relativePath,
      content,
      size: stat.size,
      lineCount: content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length,
    } satisfies WorkspaceFileResponse);
  });
}

function normalizeRelativePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized || path.isAbsolute(normalized)) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return null;
  return parts.join("/");
}

function isPathInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
