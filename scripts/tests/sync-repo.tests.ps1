$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$syncScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'sync-repo.ps1'
$sandbox = Join-Path ([System.IO.Path]::GetTempPath()) "psb-sync-tests-$([guid]::NewGuid().ToString('N'))"

function Invoke-TestGit {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed: $output" }
    return $output
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    if ($Actual -ne $Expected) { throw "$Message (expected '$Expected', got '$Actual')" }
}

function Set-TestIdentity {
    param([string]$Repo)
    Invoke-TestGit -C $Repo config user.name 'Sync Script Tests' | Out-Null
    Invoke-TestGit -C $Repo config user.email 'sync-tests@example.invalid' | Out-Null
    Invoke-TestGit -C $Repo config commit.gpgsign false | Out-Null
    Invoke-TestGit -C $Repo config core.autocrlf false | Out-Null
    Invoke-TestGit -C $Repo config core.hooksPath (Join-Path $sandbox 'no-hooks') | Out-Null
}

function New-TestRepos {
    param([string]$Name)
    $root = Join-Path $sandbox $Name
    New-Item -ItemType Directory -Path $root | Out-Null
    $origin = Join-Path $root 'origin.git'
    $local = Join-Path $root 'local'
    $peer = Join-Path $root 'peer'
    Invoke-TestGit init --bare --initial-branch=main $origin | Out-Null
    Invoke-TestGit clone $origin $local | Out-Null
    Set-TestIdentity $local
    Set-Content -LiteralPath (Join-Path $local 'shared.txt') -Value 'base' -Encoding utf8
    Invoke-TestGit -C $local add shared.txt | Out-Null
    Invoke-TestGit -C $local commit -m 'base' | Out-Null
    Invoke-TestGit -C $local push origin main | Out-Null
    Invoke-TestGit clone $origin $peer | Out-Null
    Set-TestIdentity $peer
    return @{ Root = $root; Origin = $origin; Local = $local; Peer = $peer }
}

function Add-TestCommit {
    param([string]$Repo, [string]$File, [string]$Content)
    Set-Content -LiteralPath (Join-Path $Repo $File) -Value $Content -Encoding utf8
    Invoke-TestGit -C $Repo add $File | Out-Null
    Invoke-TestGit -C $Repo commit -m $Content | Out-Null
    return Invoke-TestGit -C $Repo rev-parse HEAD
}

function Invoke-TestSync {
    param([string]$Repo)
    $global:LASTEXITCODE = 0
    & $syncScript -RepoPath $Repo | Out-Host
    return $LASTEXITCODE
}

New-Item -ItemType Directory -Path $sandbox | Out-Null
try {
    $repos = New-TestRepos 'diverged-dirty'
    $localCommit = Add-TestCommit $repos.Local 'local.txt' 'local commit before pulling'
    $remoteCommit = Add-TestCommit $repos.Peer 'remote.txt' 'incoming remote commit'
    Invoke-TestGit -C $repos.Peer push origin main | Out-Null
    Invoke-TestGit -C $repos.Local config pull.rebase true | Out-Null
    Invoke-TestGit -C $repos.Local config pull.ff only | Out-Null
    Invoke-TestGit -C $repos.Local config merge.ff only | Out-Null
    Set-Content -LiteralPath (Join-Path $repos.Local 'shared.txt') -Value 'older saved work' -Encoding utf8
    Invoke-TestGit -C $repos.Local stash push -m 'existing user stash' | Out-Null
    $existingStash = Invoke-TestGit -C $repos.Local rev-parse refs/stash
    Set-Content -LiteralPath (Join-Path $repos.Local 'local.txt') -Value 'staged work' -Encoding utf8
    Invoke-TestGit -C $repos.Local add local.txt | Out-Null
    Set-Content -LiteralPath (Join-Path $repos.Local 'shared.txt') -Value 'unstaged work' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Value 'untracked work' -Encoding utf8
    $originalStatus = @(Invoke-TestGit -C $repos.Local status --porcelain) -join "`n"
    Assert-Equal (Invoke-TestSync $repos.Local) 0 'Diverged sync should succeed'
    Invoke-TestGit -C $repos.Local merge-base --is-ancestor $localCommit HEAD | Out-Null
    Invoke-TestGit -C $repos.Local merge-base --is-ancestor $remoteCommit HEAD | Out-Null
    Assert-Equal (Invoke-TestGit -C $repos.Local rev-parse HEAD) (Invoke-TestGit --git-dir=$($repos.Origin) rev-parse main) 'Origin should include both commits'
    Assert-Equal (@(Invoke-TestGit -C $repos.Local status --porcelain) -join "`n") $originalStatus 'Staged, unstaged, and untracked work should be restored'
    Assert-Equal ((Get-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Raw).Trim()) 'untracked work' 'Untracked content should survive'
    Assert-Equal (@(Invoke-TestGit -C $repos.Local stash list).Count) 1 'Successful sync should remove only its stash'
    Assert-Equal (Invoke-TestGit -C $repos.Local rev-parse refs/stash) $existingStash 'Older user stashes should be untouched'
    Write-Host 'PASS: divergence, origin-only repo, hash preservation, and dirty-work restoration'

    $repos = New-TestRepos 'merge-conflict'
    $null = Add-TestCommit $repos.Local 'shared.txt' 'local conflicting change'
    $null = Add-TestCommit $repos.Peer 'shared.txt' 'remote conflicting change'
    Invoke-TestGit -C $repos.Peer push origin main | Out-Null
    Set-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Value 'saved through conflict' -Encoding utf8
    $remoteHead = Invoke-TestGit --git-dir=$($repos.Origin) rev-parse main
    Assert-Equal (Invoke-TestSync $repos.Local) 1 'A merge conflict must fail without pushing'
    Assert-Equal (Invoke-TestGit --git-dir=$($repos.Origin) rev-parse main) $remoteHead 'Conflict must not change origin'
    Assert-Equal (@(Invoke-TestGit -C $repos.Local stash list).Count) 1 'Conflict must retain saved work'
    Assert-Equal (Invoke-TestSync $repos.Local) 1 'An unfinished merge should stop at preflight'
    Assert-Equal (@(Invoke-TestGit -C $repos.Local stash list).Count) 1 'Preflight should not create another stash'
    Invoke-TestGit -C $repos.Local merge --abort | Out-Null
    Invoke-TestGit -C $repos.Local stash apply | Out-Null
    Assert-Equal ((Get-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Raw).Trim()) 'saved through conflict' 'Conflict stash must be recoverable'
    Write-Host 'PASS: conflicts stop safely and leave saved work recoverable'

    $repos = New-TestRepos 'restore-conflict'
    $null = Add-TestCommit $repos.Peer 'shared.txt' 'incoming change conflicts with saved work'
    Invoke-TestGit -C $repos.Peer push origin main | Out-Null
    Set-Content -LiteralPath (Join-Path $repos.Local 'shared.txt') -Value 'uncommitted local change' -Encoding utf8
    Assert-Equal (Invoke-TestSync $repos.Local) 1 'Stash restoration conflicts should report failure'
    Assert-Equal (@(Invoke-TestGit -C $repos.Local stash list).Count) 1 'Failed restoration must keep the stash'
    Assert-Equal (Invoke-TestGit -C $repos.Local diff --name-only --diff-filter=U) 'shared.txt' 'Restoration conflict should remain available for resolution'
    Assert-Equal ((Invoke-TestGit -C $repos.Local show 'stash@{0}:shared.txt') -join "`n") 'uncommitted local change' 'Saved work must remain intact in the stash'
    Write-Host 'PASS: restoration conflicts are reported without dropping saved work'

    $repos = New-TestRepos 'fetch-failure'
    Set-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Value 'saved through fetch failure' -Encoding utf8
    Invoke-TestGit -C $repos.Local remote set-url origin (Join-Path $repos.Root 'missing.git') | Out-Null
    Assert-Equal (Invoke-TestSync $repos.Local) 1 'Missing remote must fail'
    Assert-Equal ((Get-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Raw).Trim()) 'saved through fetch failure' 'Fetch failure should restore work'
    Assert-Equal (@(Invoke-TestGit -C $repos.Local stash list).Count) 0 'Restored failure stash should be removed'
    Write-Host 'PASS: fetch failure restores saved work'

    $repos = New-TestRepos 'push-race'
    $localCommit = Add-TestCommit $repos.Local 'local.txt' 'local before race'
    $remoteCommit = Add-TestCommit $repos.Peer 'remote.txt' 'remote arriving during push'
    $hooks = Join-Path $repos.Root 'hooks'
    New-Item -ItemType Directory -Path $hooks | Out-Null
    $raceHook = @'
#!/bin/sh
if [ ! -f '__MARKER__' ]; then
    touch '__MARKER__'
    git -C '__PEER__' push origin main || exit 1
fi
exit 0
'@
    $raceHook = $raceHook.Replace('__MARKER__', (Join-Path $repos.Root 'race-triggered').Replace('\', '/'))
    $raceHook = $raceHook.Replace('__PEER__', $repos.Peer.Replace('\', '/')).Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText((Join-Path $hooks 'pre-push'), "$raceHook`n", [System.Text.UTF8Encoding]::new($false))
    Invoke-TestGit -C $repos.Local config core.hooksPath $hooks | Out-Null
    Assert-Equal (Invoke-TestSync $repos.Local) 0 'A concurrent remote advance should be merged and retried'
    Invoke-TestGit -C $repos.Local merge-base --is-ancestor $localCommit HEAD | Out-Null
    Invoke-TestGit -C $repos.Local merge-base --is-ancestor $remoteCommit HEAD | Out-Null
    Assert-Equal (Invoke-TestGit -C $repos.Local rev-parse HEAD) (Invoke-TestGit --git-dir=$($repos.Origin) rev-parse main) 'Retried push should sync both histories'
    Write-Host 'PASS: concurrent remote advances are merged before retrying a normal push'

    $repos = New-TestRepos 'push-rejected'
    $localCommit = Add-TestCommit $repos.Local 'local.txt' 'local rejected push'
    $remoteHead = Invoke-TestGit --git-dir=$($repos.Origin) rev-parse main
    Set-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Value 'work survives rejected push' -Encoding utf8
    $hooks = Join-Path $repos.Root 'hooks'
    New-Item -ItemType Directory -Path $hooks | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $hooks 'pre-push'), "#!/bin/sh`nexit 1`n", [System.Text.UTF8Encoding]::new($false))
    Invoke-TestGit -C $repos.Local config core.hooksPath $hooks | Out-Null
    Assert-Equal (Invoke-TestSync $repos.Local) 1 'A push failure without new remote commits should stop'
    Assert-Equal (Invoke-TestGit --git-dir=$($repos.Origin) rev-parse main) $remoteHead 'Rejected push must not change origin'
    Assert-Equal (Invoke-TestGit -C $repos.Local rev-parse HEAD) $localCommit 'Rejected push must preserve local commits'
    Assert-Equal ((Get-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Raw).Trim()) 'work survives rejected push' 'Rejected push must restore uncommitted work'
    Write-Host 'PASS: push rejection preserves local commits and restores uncommitted work'

    $repos = New-TestRepos 'core-remote'
    $core = Join-Path $repos.Root 'core.git'
    Invoke-TestGit clone --bare $repos.Origin $core | Out-Null
    Invoke-TestGit -C $repos.Peer remote add core $core | Out-Null
    $coreCommit = Add-TestCommit $repos.Peer 'core.txt' 'incoming core commit'
    Invoke-TestGit -C $repos.Peer push core main | Out-Null
    Invoke-TestGit -C $repos.Local remote add core $core | Out-Null
    Assert-Equal (Invoke-TestSync $repos.Local) 0 'Core remote sync should succeed'
    Assert-Equal (Invoke-TestGit -C $repos.Local rev-parse core-main) $coreCommit 'core-main should mirror core/main'
    Invoke-TestGit -C $repos.Local merge-base --is-ancestor $coreCommit HEAD | Out-Null
    Write-Host 'PASS: upstream core commits are merged and pushed normally'

    $repos = New-TestRepos 'wrong-branch'
    Invoke-TestGit -C $repos.Local checkout -b feature/test | Out-Null
    Set-Content -LiteralPath (Join-Path $repos.Local 'untracked.txt') -Value 'feature work' -Encoding utf8
    Assert-Equal (Invoke-TestSync $repos.Local) 1 'Feature branches should be rejected before mutation'
    Assert-Equal (Invoke-TestGit -C $repos.Local branch --show-current) 'feature/test' 'Current branch should not change'
    Assert-Equal (@(Invoke-TestGit -C $repos.Local stash list).Count) 0 'Preflight failure must not stash work'
    Write-Host 'PASS: wrong-branch preflight leaves the worktree untouched'

    Write-Host "`nAll sync tests passed using temporary local repositories only." -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $sandbox -Recurse -Force
}