param(
  [string[]]$Paths = @(
    "README.md",
    "docs/windows-code-signing.md",
    "docs/automated-business-test-suite-plan.md"
  ),
  [switch]$IncludeReferences
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$patterns = @(
  "docs/[A-Za-z0-9_.-]+\.md",
  "PRODUCT\.md",
  "README\.md"
)

$references = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $Paths) {
  $sourcePath = if ([IO.Path]::IsPathRooted($relativePath)) {
    $relativePath
  } else {
    Join-Path $repoRoot $relativePath
  }
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    $failures.Add("Source document not found: $relativePath")
    continue
  }

  $lines = @(Get-Content -LiteralPath $sourcePath)
  for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
    $line = $lines[$lineIndex]
    foreach ($pattern in $patterns) {
      foreach ($match in [regex]::Matches($line, $pattern)) {
        $target = $match.Value -replace "\\", "/"
        $targetPath = Join-Path $repoRoot ($target -replace "/", [IO.Path]::DirectorySeparatorChar)
        $exists = Test-Path -LiteralPath $targetPath
        $references.Add([pscustomobject]@{
          source = $relativePath
          line = $lineIndex + 1
          target = $target
          exists = $exists
        })
        if (-not $exists) {
          $failures.Add("${relativePath}:$($lineIndex + 1) references missing local document: $target")
        }
      }
    }
  }
}

$uniqueReferences = @($references | Sort-Object source, line, target -Unique)
$uniqueFailures = @($failures | Sort-Object -Unique)

$result = [pscustomobject]@{
  ok = $uniqueFailures.Count -eq 0
  checkedDocuments = $Paths
  referenceCount = $uniqueReferences.Count
  failures = $uniqueFailures
}

if ($IncludeReferences) {
  $result | Add-Member -NotePropertyName references -NotePropertyValue $uniqueReferences
}

$result | ConvertTo-Json -Depth 6
if ($uniqueFailures.Count -gt 0) {
  exit 1
}
