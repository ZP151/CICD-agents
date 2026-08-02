import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ActivityDetailSection,
  ActivityFact,
  ActivityFactGrid,
} from "./ActivityDetailPrimitives.js";

describe("Activity detail primitives", () => {
  it("uses semantic, low-chrome definition lists for read-only operation facts", () => {
    const html = renderToStaticMarkup(
      <ActivityFactGrid className="grid-cols-2">
        <ActivityFact label="Repository" mono>ClaimBot_API</ActivityFact>
      </ActivityFactGrid>,
    );

    expect(html).toContain("<dl");
    expect(html).toContain("<dt");
    expect(html).toContain("<dd");
    expect(html).toContain("break-all font-mono");
    expect(html).toContain("border-b");
    expect(html).not.toContain("rounded-lg");
  });

  it("uses a structural divider instead of a container card for evidence sections", () => {
    const html = renderToStaticMarkup(
      <ActivityDetailSection title="Details">Review completed.</ActivityDetailSection>,
    );

    expect(html).toContain("<section");
    expect(html).toContain("border-t");
    expect(html).toContain("Details");
    expect(html).not.toContain("rounded-lg");
  });
});
