param(
  [Parameter(Mandatory = $true)]
  [string]$LocalRepoPath,

  [string]$Branch = "work"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $LocalRepoPath)) {
  throw "Path does not exist: $LocalRepoPath"
}

Set-Location $LocalRepoPath

if (!(Test-Path ".git")) {
  throw "No .git directory found in $LocalRepoPath. This folder is not a git clone. Re-clone from GitHub or copy files manually."
}

Write-Host "Updating repo at: $LocalRepoPath"
git fetch --all

git checkout $Branch
git pull

Write-Host "Installing/refreshing dependencies..."
npm install

Write-Host ""
Write-Host "Update complete. Run:" -ForegroundColor Green
Write-Host '$env:ANTHROPIC_API_KEY="<YOUR_KEY>"'
Write-Host "npm run dev"
Write-Host "Open http://localhost:3000"
