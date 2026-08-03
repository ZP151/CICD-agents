import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProjectLinkCombobox,
  comboboxMoveHighlight,
  comboboxOptionLabel,
  filterProjectLinks,
} from "./ProjectLinkCombobox.js";

const links = [
  { id: "a", name: "ClaimBot API", project: "TeBS-ClaimBot", repoName: "ClaimBot_API" },
  { id: "b", name: "DevAgent CICD", project: "MyTeBS", repoName: "DevAgent_CICD" },
  { id: "c", name: "e2e link", project: "Example", repoName: "example-repo" },
];

describe("filterProjectLinks (MP-012/RA-056)", () => {
  it("returns everything for an empty query", () => {
    expect(filterProjectLinks(links, "  ")).toHaveLength(3);
  });

  it("matches by name, project or repository case-insensitively", () => {
    expect(filterProjectLinks(links, "claimbot")).toHaveLength(1);
    expect(filterProjectLinks(links, "mytebs")).toHaveLength(1);
    expect(filterProjectLinks(links, "DEVAGENT")).toHaveLength(1);
  });

  it("returns no matches for unknown queries without picking the old item", () => {
    expect(filterProjectLinks(links, "nope")).toEqual([]);
  });
});

describe("comboboxMoveHighlight (MP-012/RA-055)", () => {
  it("wraps around the option list", () => {
    expect(comboboxMoveHighlight(0, 1, 3)).toBe(1);
    expect(comboboxMoveHighlight(2, 1, 3)).toBe(0);
    expect(comboboxMoveHighlight(0, -1, 3)).toBe(2);
  });

  it("starts at the top on first ArrowDown", () => {
    expect(comboboxMoveHighlight(-1, 1, 3)).toBe(0);
  });

  it("handles an empty list", () => {
    expect(comboboxMoveHighlight(0, 1, 0)).toBe(-1);
  });
});

describe("comboboxOptionLabel", () => {
  it("joins project and repository context for long-name tooltips", () => {
    expect(comboboxOptionLabel(links[0]!)).toBe("ClaimBot API · TeBS-ClaimBot / ClaimBot_API");
  });
});

describe("ProjectLinkCombobox (MP-012)", () => {
  it("renders the trigger with the selected link and stable aria", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkCombobox options={links} value="b" onSelect={() => undefined} />,
    );

    expect(html).toContain("DevAgent CICD");
    expect(html).toContain('aria-label="Project Link"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("renders the empty placeholder when nothing is selected", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkCombobox options={links} value={null} onSelect={() => undefined} />,
    );

    expect(html).toContain("No Project Link selected");
  });

  it("shows a loading state while the links are unavailable", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkCombobox options={[]} value={null} loading onSelect={() => undefined} />,
    );

    expect(html).toContain("Loading Project Link...");
  });

  it("keeps the full label available as a tooltip for long names", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkCombobox options={links} value="a" onSelect={() => undefined} />,
    );

    expect(html).toContain('title="ClaimBot API · TeBS-ClaimBot / ClaimBot_API"');
  });
});
