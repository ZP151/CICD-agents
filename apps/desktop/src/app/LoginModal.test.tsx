import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginModal, loginModalMessageClass, loginModalPanelClass } from "./LoginModal.js";

describe("LoginModal layout", () => {
  it("keeps the sign-in dialog inside small resized windows", () => {
    const className = loginModalPanelClass();

    expect(className).toContain("w-[min(440px,calc(100vw-2rem))]");
    expect(className).toContain("max-h-[calc(100vh-2rem)]");
    expect(className).toContain("overflow-y-auto");
    expect(className).not.toContain("w-[460px]");
  });

  it("wraps long Azure authentication errors instead of overflowing the dialog", () => {
    const className = loginModalMessageClass();

    expect(className).toContain("break-words");
    expect(className).toContain("leading-relaxed");
    expect(className).not.toContain("truncate");
  });

  it("exposes the sign-in surface as a labelled modal dialog", () => {
    const html = renderToStaticMarkup(<LoginModal onDone={() => undefined} onCancel={() => undefined} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="login-modal-title"');
    expect(html).toContain('id="login-modal-title"');
  });
});
