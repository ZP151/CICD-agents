import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Bubble } from "../chat.types.js";
import { ConfirmCard } from "./ConfirmCard.js";

const confirmation: Bubble = {
  id: "legacy-confirm-1",
  kind: "pending_confirm",
  riskLevel: "high",
  confirmed: null,
};

describe("ConfirmCard", () => {
  it("keeps legacy approval decisions in the shared action and risk language", () => {
    const html = renderToStaticMarkup(
      <ConfirmCard bubble={confirmation} onConfirm={() => undefined} onCancel={() => undefined} />,
    );

    expect(html).toContain("Approval required");
    expect(html).toContain("HIGH risk");
    expect(html).toContain("Approve and run");
    expect(html).toContain("Skip action");
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).toContain("rounded-lg");
    expect(html).toContain("bg-[rgb(var(--app-danger-soft))]");
  });

  it("renders a concise completed confirmation state", () => {
    const html = renderToStaticMarkup(
      <ConfirmCard bubble={{ ...confirmation, confirmed: false }} onConfirm={() => undefined} onCancel={() => undefined} />,
    );

    expect(html).toContain("Action not run.");
    expect(html).not.toContain("Yes, run this action");
  });
});
