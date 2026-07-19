export function languageFromSourcePath(path?: string): string {
  const fileName = path?.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!fileName) return "text";
  if (fileName === "dockerfile" || fileName.endsWith(".dockerfile")) return "dockerfile";
  if (fileName === "makefile" || fileName.endsWith(".sln")) return "text";

  const ext = fileName.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    appxmanifest: "xml",
    bash: "shell",
    c: "c",
    cc: "cpp",
    config: "xml",
    cmd: "shell",
    cpp: "cpp",
    cs: "csharp",
    csproj: "xml",
    cshtml: "html",
    css: "css",
    diff: "diff",
    editorconfig: "text",
    fs: "text",
    fsi: "text",
    fsproj: "xml",
    fsx: "text",
    go: "go",
    h: "c",
    hpp: "cpp",
    html: "html",
    java: "java",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    lua: "lua",
    md: "markdown",
    patch: "diff",
    pl: "perl",
    props: "xml",
    ps1: "powershell",
    py: "python",
    razor: "html",
    resx: "xml",
    rb: "ruby",
    rs: "rust",
    sh: "shell",
    sql: "sql",
    swift: "swift",
    targets: "xml",
    toml: "toml",
    ts: "typescript",
    tsx: "tsx",
    vb: "text",
    vbproj: "xml",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
  };
  return ext ? languages[ext] ?? "text" : "text";
}

export function sourceTypeLabel(path: string): string {
  const specialLabel = sourceSpecialTypeLabel(path);
  if (specialLabel) return specialLabel;
  const language = languageFromSourcePath(path);
  const labels: Record<string, string> = {
    c: "C",
    cpp: "C++",
    csharp: "CS",
    css: "CSS",
    diff: "DIFF",
    dockerfile: "DOCK",
    go: "GO",
    html: "HTML",
    java: "JAVA",
    javascript: "JS",
    jsx: "JSX",
    json: "JSON",
    lua: "LUA",
    markdown: "MD",
    perl: "PERL",
    powershell: "PS",
    python: "PY",
    ruby: "RB",
    rust: "RS",
    shell: "SH",
    sql: "SQL",
    swift: "SWFT",
    toml: "TOML",
    tsx: "TSX",
    typescript: "TS",
    xml: "XML",
    yaml: "YML",
  };
  if (labels[language]) return labels[language];

  const ext = path.split(/[./\\]/).pop()?.toLowerCase() ?? "";
  return ext ? ext.slice(0, 4).toUpperCase() : "FILE";
}

export function sourceBadgeTone(label: string): string {
  if (label === "MD") return "border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent-readable))]";
  if (["CS", "C", "C++", "GO", "JAVA", "RS", "RAZR", "VB", "F#"].includes(label)) return "border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))]";
  if (["JS", "JSX", "TS", "TSX"].includes(label)) return "border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))]";
  if (["HTML", "CSS"].includes(label)) return "border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent-readable))]";
  if (["JSON", "TOML", "YML", "XML", "CFG", "RESX"].includes(label)) return "border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))]";
  if (["SLN", "CSPJ", "VBPJ", "FSPJ", "MSB"].includes(label)) return "border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))]";
  if (["DIFF", "DOCK", "PS", "SH"].includes(label)) return "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-subtle))]";
  return "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))]";
}

function sourceSpecialTypeLabel(path: string): string | null {
  const fileName = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (fileName.endsWith(".sln")) return "SLN";
  if (ext === "csproj") return "CSPJ";
  if (ext === "vbproj") return "VBPJ";
  if (ext === "fsproj") return "FSPJ";
  if (ext === "props" || ext === "targets") return "MSB";
  if (ext === "cshtml" || ext === "razor") return "RAZR";
  if (ext === "config" || ext === "editorconfig") return "CFG";
  if (ext === "resx") return "RESX";
  if (ext === "vb") return "VB";
  if (ext === "fs" || ext === "fsx" || ext === "fsi") return "F#";
  return null;
}
