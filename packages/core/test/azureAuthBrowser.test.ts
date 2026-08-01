import { afterEach, describe, expect, it } from "vitest";
import { browserCompletionTemplate } from "../src/store/azureAuthBrowser.js";

const originalReturnUri = process.env.MERGEPILOT_RETURN_URI;

afterEach(() => {
  if (originalReturnUri === undefined) delete process.env.MERGEPILOT_RETURN_URI;
  else process.env.MERGEPILOT_RETURN_URI = originalReturnUri;
});

describe("browserCompletionTemplate", () => {
  it("does not promise an app handoff when no native return URI is configured", () => {
    delete process.env.MERGEPILOT_RETURN_URI;

    const page = browserCompletionTemplate({
      title: "You're signed in",
      message: "Microsoft sign-in is complete.",
    });

    expect(page).toContain(">Close this tab</button>");
    expect(page).toContain("Sign-in has been handed back to MergePilot.");
    expect(page).not.toContain(">Return to MergePilot</button>");
  });

  it("uses the configured native URI only when one is available", () => {
    process.env.MERGEPILOT_RETURN_URI = "mergepilot://auth/complete";

    const page = browserCompletionTemplate({
      title: "You're signed in",
      message: "Microsoft sign-in is complete.",
    });

    expect(page).toContain(">Return to MergePilot</button>");
    expect(page).toContain("window.location.href = \"mergepilot://auth/complete\"");
  });
});
