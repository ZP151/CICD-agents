import { CHAT_FINAL_TOOL_NAME } from "./chatPlannerControl.js";

export function finalizationToolSchema() {
  return {
    type: "function" as const,
    function: {
      name: CHAT_FINAL_TOOL_NAME,
      description:
        "Finalize the assistant turn with typed runtime metadata. Use this instead of writing control JSON in text.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["response", "risk_level", "actions_taken", "suggestions"],
        properties: {
          response: {
            type: "string",
            minLength: 1,
            description: "The complete user-facing response text.",
          },
          risk_level: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          actions_taken: {
            type: "array",
            items: { type: "string" },
          },
          suggestions: {
            type: "array",
            items: { type: "string" },
          },
          sources: {
            type: "array",
            description:
              "Optional source references used by the final answer. Use source_document for repository files or indexed documents, and source_url for external web or documentation references.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "title"],
              properties: {
                type: {
                  type: "string",
                  enum: ["source_document", "source_url"],
                },
                sourceId: { type: "string" },
                title: { type: "string" },
                file: { type: "string" },
                line: { type: "number" },
                snippet: { type: "string" },
                url: { type: "string" },
                domain: { type: "string" },
              },
            },
          },
          approval_proposal: {
            type: "object",
            additionalProperties: false,
            required: ["tool", "args", "description"],
            properties: {
              tool: { type: "string" },
              args: { type: "object", additionalProperties: true },
              description: { type: "string" },
              nextHint: { type: "string" },
            },
          },
        },
      },
    },
  };
}
