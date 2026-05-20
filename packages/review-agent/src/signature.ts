import crypto from "node:crypto";

/**
 * Azure DevOps service-hooks support an HTTP Basic header. The recommended
 * pattern is to put a shared secret in the password slot of the service-hook
 * subscription. We extract it from the Authorization header and constant-time
 * compare against the configured secret.
 */
export function verifyBasicSecret(authHeader: string | undefined, expected: string): boolean {
  if (!expected) return true; // Verification disabled (e.g. local dev).
  if (!authHeader || !authHeader.toLowerCase().startsWith("basic ")) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx === -1) return false;
  const password = decoded.slice(idx + 1);
  return constantTimeEqual(password, expected);
}

/**
 * Optionally, callers may send an `X-Hub-Signature-256: sha256=<hex>` header
 * (GitHub-style). We support it too for callers that prefer HMAC over Basic.
 */
export function verifyHmacSha256(
  body: Buffer | string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!secret) return true;
  if (!header) return false;
  const expectedDigest = crypto
    .createHmac("sha256", secret)
    .update(typeof body === "string" ? Buffer.from(body) : body)
    .digest("hex");
  const provided = header.replace(/^sha256=/, "").trim();
  return constantTimeEqual(provided, expectedDigest);
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
