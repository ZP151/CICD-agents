import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { verifyBasicSecret, verifyHmacSha256 } from "../src/signature.js";

describe("verifyBasicSecret", () => {
  it("returns true when no secret is configured (local dev)", () => {
    expect(verifyBasicSecret("Basic Zm9vOmJhcg==", "")).toBe(true);
  });

  it("validates the password slot", () => {
    const header = "Basic " + Buffer.from("review-agent:my-secret").toString("base64");
    expect(verifyBasicSecret(header, "my-secret")).toBe(true);
    expect(verifyBasicSecret(header, "wrong")).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyBasicSecret(undefined, "x")).toBe(false);
    expect(verifyBasicSecret("Bearer x", "x")).toBe(false);
    expect(verifyBasicSecret("Basic ???", "x")).toBe(false);
  });
});

describe("verifyHmacSha256", () => {
  it("verifies a SHA-256 HMAC", () => {
    const body = JSON.stringify({ a: 1 });
    const digest = crypto.createHmac("sha256", "k").update(body).digest("hex");
    expect(verifyHmacSha256(body, `sha256=${digest}`, "k")).toBe(true);
    expect(verifyHmacSha256(body, digest, "k")).toBe(true);
    expect(verifyHmacSha256(body, "sha256=deadbeef", "k")).toBe(false);
  });
});
