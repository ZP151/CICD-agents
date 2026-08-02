import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RepositoriesEmptyState } from "./Repos.js";

describe("Repositories legacy route", () => {
  it("hands repository setup to Project Links without exposing internal configuration paths", () => {
    const html = renderToStaticMarkup(
      createElement(RepositoriesEmptyState, { onOpenProjectLinks: vi.fn() }),
    );

    expect(html).toContain("Manage repositories from Project Links");
    expect(html).toContain("Open Project Links");
    expect(html).not.toContain("project-templates.yaml");
    expect(html).not.toContain("mergepilot init");
  });
});
