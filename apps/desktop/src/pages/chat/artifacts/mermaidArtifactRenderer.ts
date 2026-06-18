const MERMAID_THEME = {
  background: "transparent",
  primaryColor: "#eff6ff",
  primaryBorderColor: "#93c5fd",
  primaryTextColor: "#111827",
  lineColor: "#64748b",
  secondaryColor: "#f8fafc",
  tertiaryColor: "#f1f5f9",
};

export interface MermaidRenderResult {
  svg: string;
}

export async function renderMermaidDiagram(
  renderId: string,
  source: string,
): Promise<MermaidRenderResult> {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: MERMAID_THEME,
  });
  return mermaid.render(renderId, source);
}
