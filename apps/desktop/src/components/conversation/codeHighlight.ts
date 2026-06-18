const KEYWORD_GROUPS: Record<string, Set<string>> = {
  javascript: new Set([
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "let",
    "new",
    "return",
    "switch",
    "throw",
    "try",
    "type",
    "typeof",
    "var",
    "while",
  ]),
  powershell: new Set(["function", "param", "process", "begin", "end", "if", "else", "foreach", "return", "throw"]),
  csharp: new Set(["class", "public", "private", "protected", "internal", "static", "async", "await", "return", "using", "namespace", "var", "new", "void", "string", "int", "bool"]),
};

const LANGUAGE_KEYWORD_ALIASES: Record<string, keyof typeof KEYWORD_GROUPS> = {
  bash: "powershell",
  csharp: "csharp",
  javascript: "javascript",
  jsx: "javascript",
  powershell: "powershell",
  ps1: "powershell",
  ts: "javascript",
  tsx: "javascript",
  typescript: "javascript",
};

export function highlightCodeHtml(code: string, language: string): string {
  const keywords = KEYWORD_GROUPS[LANGUAGE_KEYWORD_ALIASES[language] ?? ""];
  if (!keywords) return escapeHtml(code);

  const escaped = escapeHtml(code);
  return escaped.replace(
    /(&quot;[^&]*?&quot;|'[^']*?'|`[^`]*?`|\/\/.*|#.*|\b[A-Za-z_$][\w$-]*\b|\b\d+(?:\.\d+)?\b)/g,
    (token) => highlightToken(token, keywords),
  );
}

function highlightToken(token: string, keywords: Set<string>): string {
  if (/^(&quot;|'|`)/.test(token)) return `<span class="text-emerald-300">${token}</span>`;
  if (/^(\/\/|#)/.test(token)) return `<span class="text-slate-500">${token}</span>`;
  if (/^\d/.test(token)) return `<span class="text-amber-300">${token}</span>`;
  if (keywords.has(token)) return `<span class="text-sky-300">${token}</span>`;
  return token;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
