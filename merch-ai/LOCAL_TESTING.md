# Local Testing Guide

This project was edited in a **remote workspace** at `/workspace/merch-ai`.
That path exists in the remote Linux container only, not on your Windows PC.

## Why `cd /workspace/merch-ai` failed on Windows
PowerShell tried to resolve `/workspace/merch-ai` as `C:\workspace\merch-ai`, which does not exist by default.

## Option A (recommended): clone and run in a normal folder

### 1) Open PowerShell and create a local test folder
```powershell
mkdir "$HOME\merch-ai-local-test" -Force
cd "$HOME\merch-ai-local-test"
```

### 2) Clone your repository into that folder
```powershell
git clone <YOUR_GITHUB_REPO_URL> merch-ai
cd .\merch-ai
```

### 3) Install dependencies
```powershell
npm install
```

### 4) Add your Anthropic key for API routes
```powershell
$env:ANTHROPIC_API_KEY="<YOUR_KEY>"
```

### 5) Run the app
```powershell
npm run dev
```

### 6) Open in browser
- http://localhost:3000

## Option B: one-command setup script (PowerShell)

From a directory that already contains this repo, run:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-test.ps1 -RepoUrl <YOUR_GITHUB_REPO_URL>
```

The script will:
1. Create `~/merch-ai-local-test`
2. Clone the repo into `~/merch-ai-local-test/merch-ai`
3. Run `npm install`
4. Print the exact `dev` command to start

## macOS/Linux quick start
```bash
mkdir -p ~/merch-ai-local-test
cd ~/merch-ai-local-test
git clone <YOUR_GITHUB_REPO_URL> merch-ai
cd merch-ai
npm install
export ANTHROPIC_API_KEY="<YOUR_KEY>"
npm run dev
```


## Option C: update your existing local copy (recommended if you already have the project)

If your local folder is a git clone, update it in place:
```powershell
cd "C:\path\to\your\local\merch-ai"
git fetch --all
git checkout work
git pull
npm install
$env:ANTHROPIC_API_KEY="<YOUR_KEY>"
npm run dev
```

Or use the helper script:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-existing-local-copy.ps1 -LocalRepoPath "C:\path\to\your\local\merch-ai" -Branch work
```

If your local folder is **not** a git clone (no `.git` folder), either:
1. Re-clone from GitHub (cleanest), or
2. Manually overwrite these files in your local folder with updated versions:
   - `app/page.tsx`
   - `app/globals.css`
   - `app/api/card-chat/route.ts`
   - `app/api/agent-config/route.ts`
   - `app/api/db-peek/route.ts`
