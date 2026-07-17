import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "./api.js";
import {
  chatStream,
  confirmAction,
  refreshChatIndexStatus,
  runChatWorkflowAction,
  type ChatEventPayload,
} from "./api.js";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function firstRequestBody(fetchMock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(request?.body)) as Record<string, unknown>;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error("Timed out waiting for streaming event");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("chatStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("emits SSE events as response chunks arrive instead of waiting for stream close", async () => {
    const streamControllerRef: { current?: ReadableStreamDefaultController<Uint8Array> } = {};
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamControllerRef.current = controller;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const events: ChatEventPayload[] = [];
    chatStream(
      "stream a long answer",
      "C:\\repo",
      null,
      (event) => events.push(event),
      "project-link-1",
    );
    await waitFor(() => fetchMock.mock.calls.length === 1 && streamControllerRef.current !== undefined);
    expect(firstRequestBody(fetchMock)).toMatchObject({
      message: "stream a long answer",
      repoPath: "C:\\repo",
      projectLinkId: "project-link-1",
    });

    const streamController = streamControllerRef.current;
    if (!streamController) throw new Error("Readable stream controller was not created");

    streamController.enqueue(encoder.encode(sse("ui.chunk", {
      type: "ui.chunk",
      chunk: { type: "text-delta", id: "answer-1", delta: "First visible chunk." },
    })));

    await waitFor(() => events.some((event) => event.uiChunk?.type === "text-delta"));
    expect(events.map((event) => event.type)).toEqual(["ui.chunk"]);
    expect(events[0]?.uiChunk).toEqual({
      type: "text-delta",
      id: "answer-1",
      delta: "First visible chunk.",
    });

    streamController.enqueue(encoder.encode(sse("done", {
      type: "done",
      result: {
        response: "First visible chunk. Final answer.",
        streamedResponse: "First visible chunk. Final answer.",
        finalizationMode: "agent_final",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
      },
    })));
    streamController.close();

    await waitFor(() => events.some((event) => event.type === "done"));
    expect(events.at(-1)?.result?.response).toBe("First visible chunk. Final answer.");
  });

  it("buffers partial SSE lines across arbitrary response chunk boundaries", async () => {
    const streamControllerRef: { current?: ReadableStreamDefaultController<Uint8Array> } = {};
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamControllerRef.current = controller;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const events: ChatEventPayload[] = [];
    chatStream(
      "stream across split chunks",
      "C:\\repo",
      null,
      (event) => events.push(event),
    );
    await waitFor(() => fetchMock.mock.calls.length === 1 && streamControllerRef.current !== undefined);
    const streamController = streamControllerRef.current;
    if (!streamController) throw new Error("Readable stream controller was not created");

    const payload = sse("ui.chunk", {
      type: "ui.chunk",
      chunk: { type: "text-delta", id: "split-text", delta: "Split chunk text." },
    });
    streamController.enqueue(encoder.encode(payload.slice(0, 17)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([]);

    streamController.enqueue(encoder.encode(payload.slice(17, 53)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([]);

    streamController.enqueue(encoder.encode(payload.slice(53)));
    await waitFor(() => events.length === 1);
    expect(events[0]?.type).toBe("ui.chunk");
    expect(events[0]?.uiChunk).toEqual({
      type: "text-delta",
      id: "split-text",
      delta: "Split chunk text.",
    });
    streamController.close();
  });

  it("sends image attachment payloads with chat requests", async () => {
    const streamControllerRef: { current?: ReadableStreamDefaultController<Uint8Array> } = {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamControllerRef.current = controller;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    chatStream(
      "",
      "C:\\repo",
      null,
      () => undefined,
      undefined,
      undefined,
      [
        {
          name: "screen.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    );

    await waitFor(() => fetchMock.mock.calls.length === 1 && streamControllerRef.current !== undefined);
    expect(firstRequestBody(fetchMock)).toMatchObject({
      message: "",
      repoPath: "C:\\repo",
      imageAttachments: [
        {
          name: "screen.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });
    streamControllerRef.current?.close();
  });

  it("sends the active Project Link payload supplied by the chat runtime", async () => {
    const streamControllerRef: { current?: ReadableStreamDefaultController<Uint8Array> } = {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamControllerRef.current = controller;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    chatStream(
      "Inspect pipeline 117. Read-only only.",
      "C:\\repo",
      null,
      () => undefined,
      "project-link-1",
      "built_in",
      [],
      {
        id: "project-link-1",
        name: "ClaimBot_API link",
        repoPath: "C:\\repo",
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPat: "",
        adoPipelineId: "117",
        adoPipelineName: "ClaimBot_API",
        adoMcpEnabled: false,
        adoMcpCommand: "",
        adoMcpAuthentication: "",
        adoMcpDomains: "repositories,pipelines,work-items",
        projectTemplate: "",
        buildCommand: "",
        testCommand: "",
        createdAt: 1,
        updatedAt: 1,
      },
    );

    await waitFor(() => fetchMock.mock.calls.length === 1 && streamControllerRef.current !== undefined);
    expect(firstRequestBody(fetchMock)).toMatchObject({
      message: "Inspect pipeline 117. Read-only only.",
      repoPath: "C:\\repo",
      projectLinkId: "project-link-1",
      projectLink: {
        id: "project-link-1",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "117",
        adoPipelineName: "ClaimBot_API",
      },
    });
    streamControllerRef.current?.close();
  });
});

describe("chat index API surface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not expose the removed preloading index-status fetch helper", () => {
    expect(api).not.toHaveProperty("fetchChatIndexStatus");
    expect(api).toHaveProperty("refreshChatIndexStatus");
  });

  it("keeps index refresh as an explicit user-driven API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      status: {
        repoPath: "C:\\repo",
        indexed: true,
        semanticReady: true,
        retrievalMode: "semantic-index",
        stats: {
          filesIndexed: 1,
          chunksIndexed: 2,
          chunksEmbedded: 2,
          chunksPendingEmbedding: 0,
        },
        summary: "Ready",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshChatIndexStatus("C:\\repo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    expect(String(calls[0]?.[0])).toContain("/chat/index-refresh");
    expect(firstRequestBody(fetchMock)).toMatchObject({ repoPath: "C:\\repo" });
    expect(result.status.semanticReady).toBe(true);
  });
});

describe("runChatWorkflowAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends projectLinkId without legacy profile mirroring", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      action: "inspect_changes",
      repoPath: "C:\\repo",
      tools: [],
      workflowState: {
        status: "done",
        currentStep: "done",
        completedTools: [],
        pendingTools: [],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1");

    expect(firstRequestBody(fetchMock)).toMatchObject({
      action: "inspect_changes",
      repoPath: "C:\\repo",
      projectLinkId: "project-link-1",
    });
  });

  it("omits Project Link identity when no Project Link is selected", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      action: "inspect_environment",
      repoPath: "C:\\repo",
      tools: [],
      workflowState: {
        status: "done",
        currentStep: "done",
        completedTools: [],
        pendingTools: [],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await runChatWorkflowAction("inspect_environment", "C:\\repo", null);

    const body = firstRequestBody(fetchMock);
    expect(body).toMatchObject({
      action: "inspect_environment",
      repoPath: "C:\\repo",
    });
    expect(body).not.toHaveProperty("projectLinkId");
  });

  it("omits null sessionId from workflow action requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      action: "inspect_architecture_context",
      repoPath: "C:\\repo",
      sessionId: "created-session",
      tools: [],
      workflowState: {
        status: "done",
        currentStep: "done",
        completedTools: [],
        pendingTools: [],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await runChatWorkflowAction("inspect_architecture_context", "C:\\repo", null, {
      sessionId: null,
    });

    const body = firstRequestBody(fetchMock);
    expect(body).toMatchObject({
      action: "inspect_architecture_context",
      repoPath: "C:\\repo",
    });
    expect(body).not.toHaveProperty("sessionId");
  });
});

describe("confirmAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts an explicit JSON body so the daemon accepts the approval request", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    confirmAction("chat-approval-session", () => undefined);
    await waitFor(() => fetchMock.mock.calls.length === 1);

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const request = calls[0]?.[1];
    expect(String(calls[0]?.[0])).toContain("/chat/chat-approval-session/confirm-action");
    expect(request?.method).toBe("POST");
    expect(request?.headers).toEqual({ "content-type": "application/json" });
    expect(request?.body).toBe("{}");
  });
});
