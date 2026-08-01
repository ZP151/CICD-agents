import { describe, expect, it, vi } from "vitest";
import { LLMClient } from "../src/llm.js";
import type { Settings } from "../src/settings.js";

function azureSettings(deployment: string): Settings {
  return {
    llmProvider: "azure",
    azureOpenAiEndpoint: "https://example.openai.azure.com",
    azureOpenAiApiVersion: "2024-08-01-preview",
    azureOpenAiApiKey: "test-key",
    azureOpenAiChatDeployment: deployment,
    azureOpenAiNarrativeDeployment: "",
    azureOpenAiEmbeddingDeployment: "text-embedding-3-small",
    openAiApiKey: "",
    openAiModel: "",
    openAiNarrativeModel: "",
    openAiEmbeddingModel: "text-embedding-3-small",
    secretSource: "local_env",
    azureDevOpsOrg: "",
    azureDevOpsProject: "",
    runtimeHost: "127.0.0.1",
    runtimePort: 8787,
    runtimeIdleTimeoutSec: 1800,
    runtimeDataDir: "",
    runtimeLogLevel: "info",
    plannerMaxSteps: 12,
    plannerTokenBudget: 12000,
    indexMaxFileBytes: 512 * 1024,
    indexEmbedBatch: 64,
    telemetryEnabled: false,
    appInsightsConnectionString: "",
    reviewAutoApproveEnabled: true,
    reviewStaleAgeHours: 24,
    azureStorageAccount: "",
    azureKeyVaultUrl: "",
    azureCosmosEndpoint: "",
    azureCosmosSessionTtlSec: 7_776_000,
    dataDir: "",
    runtimeUrl: "http://127.0.0.1:8787",
    llmConfigured: true,
  };
}

function setChatClient(client: LLMClient, create: ReturnType<typeof vi.fn>): void {
  (client as unknown as { client: unknown }).client = {
    chat: { completions: { create } },
  };
}

describe("LLMClient GPT-5 parameter compatibility", () => {
  it("sends max_completion_tokens for a normal GPT-5 mini Chat Completions request", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok", tool_calls: [] }, finish_reason: "stop" }],
    });
    const llm = new LLMClient(azureSettings("gpt-5-mini"));
    setChatClient(llm, create);

    await llm.chat({ messages: [{ role: "user", content: "Hello" }], maxTokens: 321, retries: 1 });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5-mini",
      max_completion_tokens: 321,
    }));
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("max_tokens");
  });

  it("uses the same GPT-5 parameter for an explicit streaming narration model", async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: "I will inspect the target." }, finish_reason: "stop" }] };
    }
    const create = vi.fn().mockResolvedValue(stream());
    const llm = new LLMClient(azureSettings("gpt-4o"));
    setChatClient(llm, create);

    for await (const _ of llm.chatStream({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt5mini",
      maxTokens: 64,
      reasoningEffort: "low",
    })) {
      // Exhaust the stream so the request completes.
    }

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt5mini",
      max_completion_tokens: 64,
      reasoning_effort: "low",
    });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("max_tokens");
  });
});
