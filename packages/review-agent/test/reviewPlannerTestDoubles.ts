import type { CloudContextBundle } from "@mergepilot/core";

export const BUNDLE: CloudContextBundle = {
  prId: 7,
  iterationId: 1,
  files: [
    {
      path: "src/app.ts",
      changeType: "edit",
      content: "export function add(a: number, b: number) {\n  return a + b;\n}\n",
    },
  ],
  relatedSnippets: [],
};
