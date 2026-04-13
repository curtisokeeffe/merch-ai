param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl,

  [string]$TargetRoot = "$HOME\merch-ai-local-test"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating local test root: $TargetRoot"
New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null

Set-Location $TargetRoot

$RepoDir = Join-Path $TargetRoot "merch-ai"
if (Test-Path $RepoDir) {
  Write-Host "Directory already exists: $RepoDir"
  Write-Host "Skipping clone. Pull latest manually if needed."
} else {
  Write-Host "Cloning repo from: $RepoUrl"
  git clone $RepoUrl merch-ai
}

Set-Location $RepoDir
Write-Host "Installing dependencies..."
npm install

Write-Host ""
Write-Host "Setup complete. Next commands:" -ForegroundColor Green
Write-Host "cd $RepoDir"
Write-Host '$env:ANTHROPIC_API_KEY="<YOUR_KEY>"'
Write-Host "npm run dev"
Write-Host "Open http://localhost:3000"
