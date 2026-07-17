import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { clampPage, paginateItems, PaginationControls } from "./PaginationControls.js";

describe("pagination helpers", () => {
  it("clamps pages into the available range", () => {
    expect(clampPage(0, 4)).toBe(1);
    expect(clampPage(2, 4)).toBe(2);
    expect(clampPage(9, 4)).toBe(4);
    expect(clampPage(9, 0)).toBe(1);
  });

  it("returns the requested page slice and display range", () => {
    const result = paginateItems(["a", "b", "c", "d", "e"], 2, 2);

    expect(result.pageItems).toEqual(["c", "d"]);
    expect(result.pageCount).toBe(3);
    expect(result.pageStart).toBe(3);
    expect(result.pageEnd).toBe(4);
  });

  it("keeps empty result sets displayable", () => {
    const result = paginateItems([], 5, 10);

    expect(result.pageItems).toEqual([]);
    expect(result.pageCount).toBe(1);
    expect(result.pageStart).toBe(0);
    expect(result.pageEnd).toBe(0);
  });

  it("uses icon-only stepper buttons with accessible labels", () => {
    const html = renderToStaticMarkup(
      <PaginationControls
        page={2}
        pageCount={3}
        pageSize={10}
        totalItems={30}
        visibleItems={10}
        itemLabel="pipelines"
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Previous pipelines page"');
    expect(html).toContain('aria-label="Next pipelines page"');
    expect(html).not.toContain(">Previous<");
    expect(html).not.toContain(">Next<");
  });
});
