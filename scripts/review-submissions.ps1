param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
)

$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error 'Node.js is required to run review-submissions.ps1.'
  exit 1
}

$scriptPath = Join-Path $PSScriptRoot 'review-submissions.mjs'
& $node.Source $scriptPath @CliArgs
exit $LASTEXITCODE
