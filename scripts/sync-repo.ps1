# sync-repo.ps1 — Run this before starting work on any device
# Usage: .\scripts\sync-repo.ps1
#
# This script merges upstream core changes into your local main branch.
# After the merge, every file that exists in core is replaced with core's copy
# (core always wins); files that exist only in this repo are left alone.
# It also adds any npm dependency core requires that package.json is missing.
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
# Per-app files that are never replaced by core's copy during sync.
$coreSyncExceptions = @('package.json', 'package-lock.json', '.vscode/settings.json', 'src/app/rewrites.json')

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

        # Core always wins: any file that exists in core but differs here (M) or
        # is missing here (D) is replaced with core's copy. Files that exist only
        # in this repo never appear in this list, so module code is untouched.
        $coreOwned = @(@(Invoke-SyncGit @('-c', 'core.quotepath=false', 'diff', '--name-only', '--no-renames', '--diff-filter=MD', 'core-main', 'HEAD')) |
            Where-Object { $_ -and ($coreSyncExceptions -notcontains $_) })
        if ($coreOwned.Count -gt 0) {
            Write-Host "  Core always wins - replacing $($coreOwned.Count) file(s) with core's copy:" -ForegroundColor Yellow
            foreach ($path in $coreOwned) { Write-Host "    $path" -ForegroundColor Yellow }
            Write-Host '  Changes to these files belong in PSBUniverse-core or in your own module folder.' -ForegroundColor Yellow
            for ($index = 0; $index -lt $coreOwned.Count; $index += 50) {
                $batch = @($coreOwned[$index..([Math]::Min($index + 49, $coreOwned.Count - 1))])
                Invoke-SyncGit (@('checkout', 'core-main', '--') + $batch) | Out-Null
            }
            & git diff --cached --quiet
            if ($LASTEXITCODE -ne 0) {
                Invoke-SyncGit @('commit', '-m', 'chore: sync core-owned files from core') | Out-Null
            }
        } else {
            Write-Host '  Core-owned files already match core.' -ForegroundColor DarkGray
        }

        # Add any npm dependency core requires that this repo's package.json lacks.
        if ((Test-Path 'scripts/sync-core-deps.mjs') -and (Test-Path 'package.json')) {
            & node scripts/sync-core-deps.mjs
            if ($LASTEXITCODE -eq 10) {
                Write-Host '  Installing packages added from core...' -ForegroundColor Green
                & npm install
                if ($LASTEXITCODE -ne 0) { throw 'npm install failed after adding core dependencies.' }
                $packageFiles = @('package.json', 'package-lock.json') | Where-Object { Test-Path $_ }
                Invoke-SyncGit (@('add', '--') + @($packageFiles)) | Out-Null
                Invoke-SyncGit @('commit', '-m', 'chore: sync dependencies with core') | Out-Null
            } elseif ($LASTEXITCODE -ne 0) {
                throw 'Core dependency check failed.'
            }
        }
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
