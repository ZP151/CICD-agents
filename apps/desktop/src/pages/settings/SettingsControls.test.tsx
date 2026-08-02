import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextInput } from "./SettingsControls.js";

describe("Settings TextInput", () => {
  it("uses the shared quiet action for a password reveal without a native hover tooltip", () => {
    const html = renderToStaticMarkup(
      <TextInput
        label="API key"
        type="password"
        value="secret"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Show API key"');
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).toContain("min-h-7");
    expect(html).not.toContain("title=");
  });
});
