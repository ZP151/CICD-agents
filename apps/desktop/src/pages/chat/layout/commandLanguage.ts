export type CommandCodeLanguage = "shell" | "powershell" | "diff";

export function commandLanguage(command: string): "shell" | "powershell" {
  return /(?:^|\\s)(?:Get-|Set-|Where-|Select-|\$[A-Za-z_])/.test(command) || /\.ps1\b/i.test(command)
    ? "powershell"
    : "shell";
}

export function commandOutputLanguage(command: string): CommandCodeLanguage {
  if (/\bgit\s+diff\b/.test(command)) return "diff";
  return commandLanguage(command);
}
