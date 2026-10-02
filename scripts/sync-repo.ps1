# sync-repo.ps1 — Run this before starting work on any device
# Usage: .\scripts\sync-repo.ps1
#
# This script merges upstream core changes into your local main branch.
# It uses MERGE (not rebase) so commit hashes are preserved and
# no force-push is needed — safe for multi-developer workflows.

param(
    [string]$RepoPath = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$stashCommit = $null
$exitCode = 0
$locationPushed = $false

function Invoke-SyncGit {
    param([string[]]$GitArguments)

    & git @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArguments -join ' ') failed (exit $LASTEXITCODE)."
    }
}

Write-Host "`n=== Syncing repo ===" -ForegroundColor Cyan

try {
    Push-Location -LiteralPath $RepoPath
    $locationPushed = $true
    $branch = Invoke-SyncGit @('branch', '--show-current')
    if ($branch -ne 'main') {
        throw 'Run sync on main. Commit or stash your work before switching branches.'
    }
    foreach ($operation in @('MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD')) {
        $operationPath = Invoke-SyncGit @('rev-parse', '--git-path', $operation)
        if (Test-Path $operationPath) {
            throw 'An unfinished Git operation exists. Resolve or abort it before syncing.'
        }
    }
    Invoke-SyncGit @('remote', 'get-url', 'origin') | Out-Null
    $remotes = @(Invoke-SyncGit @('remote'))

    $status = Invoke-SyncGit @('status', '--porcelain')
    if ($status) {
        Write-Host 'Stashing tracked and untracked changes...' -ForegroundColor Yellow
        $previousStash = & git rev-parse --verify --quiet refs/stash
        Invoke-SyncGit @('stash', 'push', '--include-untracked', '-m', 'auto-stash before sync')
        $createdStash = Invoke-SyncGit @('rev-parse', 'refs/stash')
        if ($createdStash -eq $previousStash) {
            throw 'No new stash was created. Sync stopped to protect your work.'
        }
        $stashCommit = $createdStash
        if (Invoke-SyncGit @('status', '--porcelain')) {
            throw 'The worktree is still dirty after stashing. Sync stopped.'
        }
    }

    Write-Host "`n[1/4] Fetching and merging latest main from origin..." -ForegroundColor Green
    Invoke-SyncGit @('fetch', 'origin', 'main')
    Invoke-SyncGit @('merge', '--ff', '--no-edit', 'origin/main')

    if ($remotes -contains 'core') {
        Write-Host "`n[2/4] Refreshing core-main from core remote..." -ForegroundColor Green
        Invoke-SyncGit @('fetch', 'core', 'main')
        Invoke-SyncGit @('branch', '-f', 'core-main', 'core/main')

        Write-Host "`n[3/4] Merging core-main into main..." -ForegroundColor Green
        Invoke-SyncGit @('merge', '--ff', '--no-edit', 'core-main', '-m', 'Merge upstream core changes into main')
    } else {
        Write-Host "`n[2/4] No core remote; skipping upstream core sync." -ForegroundColor Yellow
        Write-Host '[3/4] Origin-only sync.' -ForegroundColor Green
    }

    Write-Host "`n[4/4] Pushing main to origin..." -ForegroundColor Green
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $previousRemoteHead = Invoke-SyncGit @('rev-parse', 'origin/main')
        & git push origin main
        if ($LASTEXITCODE -eq 0) { break }
        if ($attempt -eq 3) {
            throw 'Push failed after three attempts. Local commits are preserved; retry sync later.'
        }

        Invoke-SyncGit @('fetch', 'origin', 'main')
        $remoteHead = Invoke-SyncGit @('rev-parse', 'origin/main')
        if ($remoteHead -eq $previousRemoteHead) {
            throw 'Push failed without new remote commits. Check permissions, branch protection, or connectivity.'
        }
        Write-Host 'Remote advanced during sync; merging and retrying normal push...' -ForegroundColor Yellow
        Invoke-SyncGit @('merge', '--ff', '--no-edit', 'origin/main')
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'No commits were rebased and no force-push was attempted.' -ForegroundColor Yellow
    $exitCode = 1
} finally {
    if ($stashCommit) {
        $mergePath = & git rev-parse --git-path MERGE_HEAD
        $unmerged = & git diff --name-only --diff-filter=U
        if ((Test-Path $mergePath) -or $unmerged) {
            Write-Host "Saved work remains in stash $stashCommit; merge conflicts need manual resolution." -ForegroundColor Yellow
            Write-Host "After resolving or aborting the merge, restore with: git stash apply --index $stashCommit" -ForegroundColor Yellow
        } else {
            Write-Host "`nRestoring saved changes (including staged and untracked files)..." -ForegroundColor Yellow
            & git stash apply --index $stashCommit
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Saved-work restoration needs attention. Stash $stashCommit has been kept." -ForegroundColor Red
                $exitCode = 1
            } else {
                $stashHashes = @(& git stash list --format=%H)
                $stashIndex = [Array]::IndexOf([string[]]$stashHashes, [string]$stashCommit)
                if ($stashIndex -ge 0) {
                    & git stash drop "stash@{$stashIndex}"
                    if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
                }
            }
        }
    }
    if ($locationPushed) { Pop-Location }
}

if ($exitCode -eq 0) {
    Write-Host "`n=== Sync complete! Ready to work. ===" -ForegroundColor Cyan
}
exit $exitCode
