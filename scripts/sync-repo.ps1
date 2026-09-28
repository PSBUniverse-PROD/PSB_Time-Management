# sync-repo.ps1 — Run this before starting work on any device
# Usage: .\scripts\sync-repo.ps1
#
# This script merges upstream core changes into your local main branch.
# It uses MERGE (not rebase) so commit hashes are preserved and
# no force-push is needed — safe for multi-developer workflows.

Write-Host "`n=== Syncing repo ===" -ForegroundColor Cyan

# Save any uncommitted work
$status = git status --porcelain
if ($status) {
    Write-Host "Stashing uncommitted changes..." -ForegroundColor Yellow
    git stash push -m "auto-stash before sync"
    $stashed = $true
} else {
    $stashed = $false
}

# 1. Pull latest main from origin (your team's remote)
Write-Host "`n[1/4] Pulling latest main from origin..." -ForegroundColor Green
git checkout main
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to pull main. Resolve conflicts and retry." -ForegroundColor Red
    exit 1
}

# 2. Refresh core-main tracking branch from core remote
Write-Host "`n[2/4] Refreshing core-main from core remote..." -ForegroundColor Green
git fetch core main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to fetch core/main. Resolve and retry." -ForegroundColor Red
    exit 1
}

# Keep core-main as a clean mirror of core/main to avoid local branch drift.
git branch -f core-main core/main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to realign core-main to core/main." -ForegroundColor Red
    exit 1
}

# 3. Merge core-main into main (preserves commit history, no rewrite)
Write-Host "`n[3/4] Merging core-main into main..." -ForegroundColor Green
git checkout main
git merge core-main -m "Merge upstream core changes into main"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Merge conflict. Resolve manually, then run:" -ForegroundColor Red
    Write-Host "  git add ." -ForegroundColor Yellow
    Write-Host "  git merge --continue" -ForegroundColor Yellow
    Write-Host "  git push origin main" -ForegroundColor Yellow
    exit 1
}

# 4. Push main (normal push, no force needed)
Write-Host "`n[4/4] Pushing main to origin..." -ForegroundColor Green
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Push failed. You may need to pull first (git pull origin main)." -ForegroundColor Red
    exit 1
}

# Restore stashed changes if any
if ($stashed) {
    Write-Host "`nRestoring stashed changes..." -ForegroundColor Yellow
    git stash pop
}

Write-Host "`n=== Sync complete! Ready to work. ===" -ForegroundColor Cyan
