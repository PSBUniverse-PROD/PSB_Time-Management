# setup.ps1 — One-time setup for new developers or fresh clones
# Usage: .\scripts\setup.ps1
#
# This script:
#   1. Connects the core remote (if missing) with push disabled
#   2. Installs npm packages (if node_modules is missing)
#   3. Creates .env.local with template (if missing) — includes SSO config
#   4. Validates SSO authentication configuration
#   5. Adds VS Code read-only rules for protected folders (module repos only)
#
# If everything is already set up, the script does nothing.

# Resolve the project root (parent of the scripts/ folder)
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
Set-Location $projectRoot

Write-Host "`n=== PSBUniverse Setup ===" -ForegroundColor Cyan
Write-Host "Project root: $projectRoot" -ForegroundColor DarkGray

$allGood = $true

# Detect repo mode by remote state:
#   - 1 remote whose URL contains "PSBUniverse-core" = core repo (senior maintenance clone)
#   - 1 remote pointing elsewhere = app repo fresh clone (needs core remote added)
#   - 2+ remotes = app repo already configured (origin + core)
$allRemotes = @(git remote 2>$null)
$isModuleRepo = $true

if ($allRemotes.Count -eq 1) {
    $url = git remote get-url $allRemotes[0] 2>$null
    if ($url -match "PSBUniverse-core") {
        $isModuleRepo = $false
    }
}
# If 2+ remotes, it's definitely a module repo (origin + core)

if ($isModuleRepo) {
    Write-Host "Repo mode: app/module repo (origin writable, core read-only)." -ForegroundColor DarkGray
} else {
    Write-Host "Repo mode: core repo (senior maintenance)." -ForegroundColor DarkGray
}

# ── 1. Core remote (module repos only) ─────────────────────────

if ($isModuleRepo) {
    $coreUrl = git remote get-url core 2>$null

    if (-not $coreUrl) {
        Write-Host "`n[1/5] Adding core remote..." -ForegroundColor Green
        git remote add core https://github.com/PSBUniverse-DEV/PSBUniverse-core.git
        git remote set-url --push core no_push_allowed
        Write-Host "  Core remote added (push disabled)." -ForegroundColor Gray
        $allGood = $false
    } else {
        # Ensure push is always disabled, even if someone reconfigured it
        $corePush = git remote get-url --push core 2>$null
        if ($corePush -ne "DISABLED" -and $corePush -ne "no_push_allowed") {
            git remote set-url --push core no_push_allowed
            Write-Host "[1/5] Core remote push URL re-locked." -ForegroundColor Yellow
            $allGood = $false
        } else {
            Write-Host "[1/5] Core remote OK." -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "[1/5] Core repo detected - skipping core remote setup." -ForegroundColor DarkGray
}

# ── 2. npm install ──────────────────────────────────────────────

if (-not (Test-Path "node_modules")) {
    Write-Host "`n[2/5] Installing packages..." -ForegroundColor Green
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: npm install failed." -ForegroundColor Red
        exit 1
    }
    $allGood = $false
} else {
    Write-Host "[2/5] node_modules OK." -ForegroundColor DarkGray
}

# ── 3. .env.local with SSO configuration ──────────────────────

$envLocalPath = Join-Path $projectRoot ".env.local"

if (-not (Test-Path $envLocalPath)) {
    Write-Host "`n[3/5] Creating .env.local template with SSO config..." -ForegroundColor Green

    $template = @"
# ─── Environment selector ───────────────────────────────────
# Controls which config block in config/app.js is used.
# Values: "local" | "dev" | "prod"
NEXT_PUBLIC_ENV=local

# ─── Supabase (shared across all apps) ──────────────────────
# The Supabase project URL and anon key. These are the same for
# both core and modular apps — they all connect to the same DB.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# ─── Supabase service role (server-side only) ───────────────
# Used in Server Actions ("use server" files) for admin-level
# DB access. NEVER exposed to the browser.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ─── Supabase publishable / secret (local emulator only) ────
# Only used when running Supabase locally via `supabase start`.
# Not used in production.
SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
SUPABASE_SECRET_KEY=your-secret-key-here

# ─── Core portal URL (shared) ───────────────────────────────
# The base URL of the core PSBUniverse portal. Used for:
#   - SSO login/logout redirects
#   - Building absolute URLs to core pages
# In local dev, this points to production because the SSO
# login page lives on the production server.
# Modular apps also use this to redirect back to core.
NEXT_PUBLIC_CORE_PORTAL_URL=https://www.psbuniverse.com

# ─── JWT (shared across all apps) ───────────────────────────
# Used to sign/verify custom auth tokens between core and
# modular apps. Must be the SAME in every app's .env.local.
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRATION=24h

# ─── Cookie domain (shared) ─────────────────────────────────
# The domain scope for auth cookies. ".psbuniverse.com" allows
# the cookie to be shared across all subdomains (core + modules).
NEXT_PUBLIC_COOKIE_DOMAIN=.psbuniverse.com

# ─── Your Module ID ────────────────
# The ID of the current module. Used for identifying the module
# in the system.
NEXT_PUBLIC_MODULE_ID=your-app-module-id-here
"@
    $template | Set-Content -Path $envLocalPath -Encoding UTF8
    Write-Host "  .env.local created at: $envLocalPath" -ForegroundColor Yellow
    Write-Host "  IMPORTANT: Open .env.local and paste your real Supabase keys." -ForegroundColor Yellow
    Write-Host "  Ask your senior dev if you don't have them." -ForegroundColor Yellow
    $allGood = $false
} else {
    Write-Host "[3/5] .env.local OK." -ForegroundColor DarkGray
}

# ── 4. SSO Configuration Validation ──────────────────────────

Write-Host "`n[4/5] Validating SSO configuration..." -ForegroundColor Green

$ssoIssues = @()

# Check JWT_SECRET
$jwtSecret = (Select-String -Path $envLocalPath -Pattern "^JWT_SECRET=" 2>$null)
if (-not $jwtSecret) {
    $ssoIssues += "JWT_SECRET is missing from .env.local"
} elseif ($jwtSecret -match "your-secret-key-change-this-in-production") {
    $ssoIssues += "JWT_SECRET still has the default placeholder value - change it for production"
}

# Check NEXT_PUBLIC_COOKIE_DOMAIN
$cookieDomain = (Select-String -Path $envLocalPath -Pattern "^NEXT_PUBLIC_COOKIE_DOMAIN=" 2>$null)
if (-not $cookieDomain) {
    $ssoIssues += "NEXT_PUBLIC_COOKIE_DOMAIN is missing from .env.local"
}

# Check Supabase keys
$supabaseUrl = (Select-String -Path $envLocalPath -Pattern "^NEXT_PUBLIC_SUPABASE_URL=" 2>$null)
$supabaseKey = (Select-String -Path $envLocalPath -Pattern "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" 2>$null)
$serviceKey = (Select-String -Path $envLocalPath -Pattern "^SUPABASE_SERVICE_ROLE_KEY=" 2>$null)

if (-not $supabaseUrl) { $ssoIssues += "NEXT_PUBLIC_SUPABASE_URL is missing" }
if (-not $supabaseKey) { $ssoIssues += "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing" }
if (-not $serviceKey) { $ssoIssues += "SUPABASE_SERVICE_ROLE_KEY is missing" }

# Check for jose dependency (required for JWT)
if (-not (Test-Path "node_modules/jose")) {
    $ssoIssues += "jose package is not installed - run 'npm install jose'"
}

# Check core auth files exist
$authFiles = @(
    "src/core/auth/jwt.utils.js",
    "src/core/auth/cookies.utils.js",
    "src/core/auth/session.service.js",
    "src/core/auth/middleware.auth.js"
)

foreach ($file in $authFiles) {
    if (-not (Test-Path $file)) {
        $ssoIssues += "Missing core auth file: $file - sync from core repo"
    }
}

# Check API auth routes exist
$apiRoutes = @(
    "src/app/api/auth/login/route.js",
    "src/app/api/auth/logout/route.js",
    "src/app/api/auth/validate-token/route.js",
    "src/app/api/auth/refresh-token/route.js"
)

foreach ($route in $apiRoutes) {
    if (-not (Test-Path $route)) {
        $ssoIssues += "Missing API auth route: $route - sync from core repo"
    }
}

# Check SSO migration ran
$migrationFile = "supabase/migrations/20260618000000_sso_system.sql"
if (-not (Test-Path $migrationFile)) {
    $ssoIssues += "Missing SSO migration: $migrationFile - sync from core repo"
}

if ($ssoIssues.Count -gt 0) {
    Write-Host "  SSO configuration issues found:" -ForegroundColor Yellow
    foreach ($issue in $ssoIssues) {
        Write-Host "    ⚠ $issue" -ForegroundColor Yellow
    }
    $allGood = $false
} else {
    Write-Host "  SSO configuration looks good." -ForegroundColor DarkGray
}

# ── 5. VS Code read-only rules (module repos only) ─────────────
#
# Strategy: lock EVERYTHING, then unlock only the jr dev's own module folders.
# setup.ps1 scans src/modules/ and treats any folder that is NOT a core group
# (admin, psbpages) as the dev's own module — those get excluded from readonly.

$settingsPath = ".vscode/settings.json"

if ($isModuleRepo) {
    # Core module groups (synced from core, must stay readonly)
    $coreModuleGroups = @("admin", "psbpages")

    # Detect jr dev's own module folders (everything else in src/modules/)
    $devModules = @()
    if (Test-Path "src/modules") {
        Get-ChildItem -Path "src/modules" -Directory | ForEach-Object {
            if ($_.Name -notin $coreModuleGroups) {
                $devModules += $_.Name
            }
        }
    }

    # Check if current settings already have the correct readonly config
    $needsUpdate = $true
    if (Test-Path $settingsPath) {
        $raw = Get-Content $settingsPath -Raw
        if ($raw -match '"files\.readonlyInclude"' -and $raw -match '"\*\*"\s*:\s*true') {
            # readonlyInclude with ** exists — check if all dev modules are excluded
            $allExcluded = $true
            foreach ($mod in $devModules) {
                if ($raw -notmatch [regex]::Escape("**/src/modules/$mod/**")) {
                    $allExcluded = $false
                    break
                }
            }
            if ($allExcluded -and $raw -match '"files\.readonlyExclude"') {
                $needsUpdate = $false
            }
        }
    }

    if ($needsUpdate) {
        Write-Host "`n[5/5] Configuring VS Code read-only rules..." -ForegroundColor Green

        if (-not (Test-Path ".vscode")) {
            New-Item -ItemType Directory -Path ".vscode" -Force | Out-Null
        }

        # Read or create settings object
        if (Test-Path $settingsPath) {
            $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
        } else {
            $settings = New-Object PSObject
        }

        # readonlyInclude: lock everything
        $include = New-Object PSObject
        $include | Add-Member -NotePropertyName "**" -NotePropertyValue $true
        if ($settings.PSObject.Properties["files.readonlyInclude"]) {
            $settings."files.readonlyInclude" = $include
        } else {
            $settings | Add-Member -NotePropertyName "files.readonlyInclude" -NotePropertyValue $include
        }

        # readonlyExclude: unlock dev's own module folders + .env files
        $exclude = New-Object PSObject
        $exclude | Add-Member -NotePropertyName "**/.env*" -NotePropertyValue $true
        foreach ($mod in ($devModules | Sort-Object)) {
            $exclude | Add-Member -NotePropertyName "**/src/modules/$mod/**" -NotePropertyValue $true
        }
        if ($settings.PSObject.Properties["files.readonlyExclude"]) {
            $settings."files.readonlyExclude" = $exclude
        } else {
            $settings | Add-Member -NotePropertyName "files.readonlyExclude" -NotePropertyValue $exclude
        }

        $settings | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8

        if ($devModules.Count -gt 0) {
            Write-Host "  Everything is read-only EXCEPT:" -ForegroundColor Gray
            foreach ($mod in $devModules) {
                Write-Host "    - src/modules/$mod/" -ForegroundColor White
            }
            Write-Host "    - .env files" -ForegroundColor White
        } else {
            Write-Host "  Everything is read-only. No module folders detected yet." -ForegroundColor Yellow
            Write-Host "  Run setup.ps1 again after creating your module." -ForegroundColor Yellow
        }
        $allGood = $false
    } else {
        Write-Host "[5/5] VS Code read-only rules OK." -ForegroundColor DarkGray
    }
} else {
    Write-Host "[5/5] Core repo detected - skipping VS Code read-only rules." -ForegroundColor DarkGray
}

# ── Done ────────────────────────────────────────────────────────

if ($allGood) {
    Write-Host "`n=== Everything is already set up. Nothing to do. ===" -ForegroundColor Cyan
} else {
    Write-Host "`n=== Setup complete! ===" -ForegroundColor Cyan
if (-not (Test-Path $envLocalPath) -or (Get-Content $envLocalPath -Raw) -match "your-project\.supabase\.co") {
    Write-Host "REMINDER: Update .env.local with your real Supabase keys before running the app." -ForegroundColor Yellow
}
    if ($ssoIssues.Count -gt 0) {
        Write-Host "REMINDER: Resolve the SSO configuration issues listed above." -ForegroundColor Yellow
        Write-Host "  See docs/09-sso-architecture/ for setup guidance." -ForegroundColor Yellow
    }
}