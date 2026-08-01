import { describe, expect, it } from "vitest";
import { explainChatSseError } from "../src/routes/chat.routes.js";

describe("chat route model error messages", () => {
  it("explains Azure resource-not-found failures without presenting them as a transcript failure", () => {
    const message = explainChatSseError(
      new Error("404 Resource not found"),
      { azureOpenAiChatDeployment: "configured-chat" } as never,
      () => "test configuration",
    );

    expect(message).toContain("endpoint or deployment was not found");
    expect(message).toContain("Deployment: configured-chat");
    expect(message).toContain("verify the Azure endpoint and chat deployment");
  });
});
