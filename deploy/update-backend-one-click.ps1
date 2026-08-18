[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\Users\Administrator\Desktop\zolos',
    [string]$ProbeUrl = 'https://rt.zolos.online/api/rpc/open_vending_stall'
)

$ErrorActionPreference = 'Stop'

function Step([string]$Message) {
    Write-Host "`n[ZOLOS] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    Write-Host "`n[ZOLOS][STOP] $Message" -ForegroundColor Red
    exit 1
}

try {
    # Restarting a process and installing packages needs elevation. Relaunch
    # only this script; no execution-policy change is persisted on the machine.
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) {
        Step 'Requesting Administrator permission...'
        $child = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
            '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', $PSCommandPath,
            '-RepoPath', $RepoPath,
            '-ProbeUrl', $ProbeUrl
        )
        exit $child.ExitCode
    }

    $RepoPath = [IO.Path]::GetFullPath($RepoPath)
    $GitDir = Join-Path $RepoPath '.git'
    $ServerPath = Join-Path $RepoPath 'server'
    $ServerEntry = Join-Path $ServerPath 'server.js'
    $ServerEnv = Join-Path $ServerPath '.env'
    $Npm = 'C:\Program Files\nodejs\npm.cmd'
    $Node = 'C:\Program Files\nodejs\node.exe'

    if (-not (Test-Path $GitDir)) { Fail "Not a Git repository: $RepoPath" }
    if (-not (Test-Path $ServerEntry)) { Fail "Missing backend entrypoint: $ServerEntry" }
    if (-not (Test-Path $ServerEnv)) { Fail "Missing backend environment file: $ServerEnv" }
    if (-not (Test-Path $Npm)) { Fail "npm.cmd not found at $Npm" }
    if (-not (Test-Path $Node)) { Fail "node.exe not found at $Node" }

    $origin = (& git -C $RepoPath remote get-url origin).Trim()
    if ($origin -notmatch 'github\.com[/:]narapath3/zolos(?:\.git)?$') {
        Fail "Unexpected origin remote: $origin"
    }

    $branch = (& git -C $RepoPath branch --show-current).Trim()
    if ($branch -ne 'main') { Fail "Expected branch main, found '$branch'" }

    $trackedDirty = $false
    & git -C $RepoPath diff --quiet --ignore-submodules
    if ($LASTEXITCODE -ne 0) { $trackedDirty = $true }
    & git -C $RepoPath diff --cached --quiet --ignore-submodules
    if ($LASTEXITCODE -ne 0) { $trackedDirty = $true }
    if ($trackedDirty) {
        Fail 'Tracked or staged changes exist. Commit or stash them manually; this script will not overwrite them.'
    }

    $untracked = @(& git -C $RepoPath status --porcelain | Where-Object { $_ -like '??*' })
    if ($untracked.Count -gt 0) {
        Write-Host "[ZOLOS] Keeping $($untracked.Count) untracked path(s) untouched." -ForegroundColor Yellow
    }

    Step 'Fetching origin/main without changing the working tree...'
    & git -C $RepoPath fetch origin main
    if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed' }

    $before = (& git -C $RepoPath rev-parse HEAD).Trim()
    $remote = (& git -C $RepoPath rev-parse origin/main).Trim()
    & git -C $RepoPath merge-base --is-ancestor HEAD origin/main
    if ($LASTEXITCODE -ne 0) {
        Fail "Local main is not an ancestor of origin/main. Refusing non-fast-forward update. Local=$before Remote=$remote"
    }

    Step "Fast-forwarding main to $remote..."
    & git -C $RepoPath pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { Fail 'git pull --ff-only failed' }

    $after = (& git -C $RepoPath rev-parse HEAD).Trim()
    if ($after -ne $remote) { Fail "Unexpected post-pull HEAD: $after (expected $remote)" }
    if (-not (Select-String -Path (Join-Path $RepoPath 'server\api\rpc.js') -Pattern "open_vending_stall" -Quiet)) {
        Fail 'Updated source still does not contain open_vending_stall handler'
    }

    Step 'Finding the ZOLOS backend process...'
    $backend = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -match '(?i)(^|\s)server\.js([\s"]|$)' })
    if ($backend.Count -gt 1) {
        $details = $backend | ForEach-Object { "PID=$($_.ProcessId) CMD=$($_.CommandLine)" }
        Fail "Found multiple server.js processes. Refusing to guess:`n$($details -join "`n")"
    }
    if ($backend.Count -eq 0) {
        Write-Host '[ZOLOS] No existing server.js process found; starting one.' -ForegroundColor Yellow
    } else {
        $backendPid = [int]$backend[0].ProcessId
        Step "Stopping only server.js PID $backendPid..."
        Stop-Process -Id $backendPid -Force
        Start-Sleep -Seconds 2
    }

    Step 'Installing backend production dependencies...'
    Push-Location $ServerPath
    try {
        & $Npm ci --omit=dev
        if ($LASTEXITCODE -ne 0) { Fail 'server npm ci failed' }
    } finally {
        Pop-Location
    }

    $logDir = Join-Path $RepoPath 'logs'
    New-Item -ItemType Directory -Force $logDir | Out-Null
    $stdout = Join-Path $logDir 'server.out.log'
    $stderr = Join-Path $logDir 'server.err.log'
    Step 'Starting the updated ZOLOS backend...'
    $started = Start-Process -FilePath $Node -WorkingDirectory $ServerPath -ArgumentList @('--env-file=.env', 'server.js') -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 5
    $live = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
    if (-not $live) {
        $tail = if (Test-Path $stderr) { (Get-Content $stderr -Tail 40) -join "`n" } else { '(no stderr log)' }
        Fail "Backend exited immediately. Error log:`n$tail"
    }

    Step 'Verifying the RPC route without credentials...'
    try {
        $response = Invoke-WebRequest -Method Post -Uri $ProbeUrl -ContentType 'application/json' -Body '{}' -UseBasicParsing
        $status = [int]$response.StatusCode
        $body = $response.Content
    } catch {
        $status = 0
        $body = ''
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            $reader.Dispose()
        } else {
            $body = $_.Exception.Message
        }
    }

    if ($body -match 'unknown rpc') {
        Fail "The live API still reports unknown rpc. Backend may be behind a reverse proxy or another server process. HTTP=$status Body=$body"
    }
    if ($status -ne 401 -and $body -notmatch 'auth required|not_authed') {
        Fail "Unexpected RPC probe response. HTTP=$status Body=$body"
    }

    Write-Host "`n[ZOLOS][OK] Backend updated and RPC route is present." -ForegroundColor Green
    Write-Host "[ZOLOS] Commit: $after"
    Write-Host "[ZOLOS] Backend PID: $($started.Id)"
    Write-Host "[ZOLOS] Untracked files were left untouched."
    exit 0
} catch {
    Write-Host "`n[ZOLOS][STOP] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
