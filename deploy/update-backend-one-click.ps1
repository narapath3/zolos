[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\Users\Administrator\Desktop\zolos',
    [string]$ProbeUrl = 'https://rt.zolos.online/api/rpc/open_vending_stall',
    [string]$LocalProbeUrl = 'http://127.0.0.1:3001/api/rpc/open_vending_stall',
    [string]$BackupRoot = '',
    [switch]$SkipRemoteProbe,
    [switch]$RunFrontendBuild,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:StartedProcess = $null
$script:BeforeCommit = $null
$script:AfterCommit = $null
$script:PulledNewCommit = $false
$script:FrontendWasRunning = $false
$script:LogFile = $null

function Write-Step([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ZOLOS] $Message"
    Write-Host $line -ForegroundColor Cyan
    if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value $line }
}

function Write-Warn([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ZOLOS][WARN] $Message"
    Write-Host $line -ForegroundColor Yellow
    if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value $line }
}

function Write-Ok([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ZOLOS][OK] $Message"
    Write-Host $line -ForegroundColor Green
    if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value $line }
}

function Invoke-Native([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($exitCode -ne 0) {
        throw "Command failed ($exitCode): $FilePath $($Arguments -join ' ')"
    }
}

function Get-NativePath([string]$CommandName, [string]$Fallback) {
    $command = Get-Command $CommandName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and $command.Source) { return $command.Source }
    if (Test-Path $Fallback) { return $Fallback }
    throw "Required command was not found: $CommandName"
}

function Stop-ZolosBackend {
    $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -match '(?i)(^|[\\/\s])server\.js([\s\"]|$)' })
    if ($processes.Count -gt 1) {
        $details = $processes | ForEach-Object { "PID=$($_.ProcessId) CMD=$($_.CommandLine)" }
        throw "Found multiple server.js processes. Refusing to guess:`n$($details -join "`n")"
    }
    if ($processes.Count -eq 0) {
        Write-Warn 'No existing server.js process found.'
        return
    }
    $backendPid = [int]$processes[0].ProcessId
    Write-Step "Stopping backend PID $backendPid..."
    Stop-Process -Id $backendPid -Force
    Start-Sleep -Seconds 2
}

function Stop-ZolosFrontendIfRunning {
    $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -match '(?i)static-server\.mjs' })
    if ($processes.Count -gt 1) {
        $details = $processes | ForEach-Object { "PID=$($_.ProcessId) CMD=$($_.CommandLine)" }
        throw "Found multiple static-server.mjs processes. Refusing to guess:`n$($details -join "`n")"
    }
    if ($processes.Count -eq 0) { return }
    $frontendPid = [int]$processes[0].ProcessId
    $script:FrontendWasRunning = $true
    Write-Step "Stopping frontend static server PID $frontendPid..."
    Stop-Process -Id $frontendPid -Force
    Start-Sleep -Seconds 2
}

function Start-ZolosFrontend([string]$NodePath, [string]$RepoPath, [string]$LogDir) {
    $stdout = Join-Path $LogDir 'frontend.out.log'
    $stderr = Join-Path $LogDir 'frontend.err.log'
    if (Test-Path $stdout) { Remove-Item -Force $stdout }
    if (Test-Path $stderr) { Remove-Item -Force $stderr }
    Write-Step 'Starting updated frontend static server...'
    return Start-Process -FilePath $NodePath -WorkingDirectory $RepoPath `
        -ArgumentList @('deploy\static-server.mjs') `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
        -WindowStyle Hidden -PassThru
}

function Start-ZolosBackend([string]$NodePath, [string]$ServerPath, [string]$LogDir) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $stdout = Join-Path $LogDir 'server.out.log'
    $stderr = Join-Path $LogDir 'server.err.log'
    if (Test-Path $stdout) { Remove-Item -Force $stdout }
    if (Test-Path $stderr) { Remove-Item -Force $stderr }
    Write-Step 'Starting updated ZOLOS backend...'
    return Start-Process -FilePath $NodePath -WorkingDirectory $ServerPath `
        -ArgumentList @('--env-file=.env', 'server.js') `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
        -WindowStyle Hidden -PassThru
}

function Get-ProbeResult([string]$Url) {
    try {
        $response = Invoke-WebRequest -Method Post -Uri $Url -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 12
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = [string]$response.Content; Error = '' }
    } catch {
        $status = 0
        $body = ''
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
            try {
                $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                $reader.Dispose()
            } catch { $body = $_.Exception.Message }
        } else {
            $body = $_.Exception.Message
        }
        return [pscustomobject]@{ Status = $status; Body = $body; Error = $_.Exception.Message }
    }
}

function Assert-ProbeHealthy([string]$Label, [string]$Url) {
    for ($attempt = 1; $attempt -le 15; $attempt++) {
        $result = Get-ProbeResult $Url
        if ($result.Body -match '(?i)unknown rpc') {
            throw "$Label reports unknown rpc. URL=$Url HTTP=$($result.Status) Body=$($result.Body)"
        }
        # The unauthenticated RPC response is the expected health signal. A
        # route that exists must reject the empty request instead of being absent.
        if (($result.Status -eq 401) -or ($result.Body -match '(?i)auth required|not_authed|missing.*auth|invalid.*token')) {
            Write-Ok "$Label healthy (unauthenticated RPC rejected as expected, HTTP=$($result.Status))."
            return
        }
        if ($result.Status -gt 0) {
            Write-Warn "$Label responded HTTP=$($result.Status); waiting for the expected auth response..."
        } else {
            Write-Warn "$Label is not reachable yet; retry $attempt/15..."
        }
        Start-Sleep -Seconds 2
    }
    throw "$Label health check failed: $Url"
}

try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host '[ZOLOS] Requesting Administrator permission...' -ForegroundColor Cyan
        $args = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
            '-RepoPath', $RepoPath, '-ProbeUrl', $ProbeUrl, '-LocalProbeUrl', $LocalProbeUrl)
        if ($BackupRoot) { $args += @('-BackupRoot', $BackupRoot) }
        if ($SkipRemoteProbe) { $args += '-SkipRemoteProbe' }
        if ($RunFrontendBuild) { $args += '-RunFrontendBuild' }
        if ($DryRun) { $args += '-DryRun' }
        $child = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $args
        exit $child.ExitCode
    }

    $RepoPath = [IO.Path]::GetFullPath($RepoPath)
    $ServerPath = Join-Path $RepoPath 'server'
    $ServerEntry = Join-Path $ServerPath 'server.js'
    $ServerPackage = Join-Path $ServerPath 'package.json'
    $ServerLock = Join-Path $ServerPath 'package-lock.json'
    $ServerEnv = Join-Path $ServerPath '.env'
    $LogDir = Join-Path $RepoPath 'logs'
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $script:LogFile = Join-Path $LogDir ("update-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType File -Force -Path $script:LogFile | Out-Null

    $Git = Get-NativePath 'git.exe' 'C:\Program Files\Git\bin\git.exe'
    $Npm = Get-NativePath 'npm.cmd' 'C:\Program Files\nodejs\npm.cmd'
    $Node = Get-NativePath 'node.exe' 'C:\Program Files\nodejs\node.exe'

    if (-not (Test-Path (Join-Path $RepoPath '.git'))) { throw "Not a Git repository: $RepoPath" }
    if (-not (Test-Path $ServerEntry)) { throw "Missing backend entrypoint: $ServerEntry" }
    if (-not (Test-Path $ServerPackage)) { throw "Missing backend package.json: $ServerPackage" }
    if (-not (Test-Path $ServerLock)) { throw "Missing backend package-lock.json: $ServerLock" }
    if (-not (Test-Path $ServerEnv)) { throw "Missing backend .env: $ServerEnv" }

    $origin = (& $Git -C $RepoPath remote get-url origin).Trim()
    if ($origin -notmatch 'github\.com[/:]narapath3/zolos(?:\.git)?$') { throw "Unexpected origin remote: $origin" }
    $branch = (& $Git -C $RepoPath branch --show-current).Trim()
    if ($branch -ne 'main') { throw "Expected branch main, found '$branch'" }

    & $Git -C $RepoPath diff --quiet --ignore-submodules
    $trackedDirty = ($LASTEXITCODE -ne 0)
    & $Git -C $RepoPath diff --cached --quiet --ignore-submodules
    $stagedDirty = ($LASTEXITCODE -ne 0)
    if ($trackedDirty -or $stagedDirty) { throw 'Tracked or staged changes exist. Commit or stash them manually; updater will not overwrite them.' }

    $untracked = @(& $Git -C $RepoPath status --porcelain | Where-Object { $_ -like '??*' })
    if ($untracked.Count -gt 0) { Write-Warn "Keeping $($untracked.Count) untracked path(s) untouched." }

    $script:BeforeCommit = (& $Git -C $RepoPath rev-parse HEAD).Trim()
    if (-not $BackupRoot) { $BackupRoot = Join-Path (Split-Path $RepoPath -Parent) 'zolos-deploy-backups' }
    $backupDir = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Set-Content -LiteralPath (Join-Path $backupDir 'before-commit.txt') -Value $script:BeforeCommit
    Copy-Item -LiteralPath $ServerEnv -Destination (Join-Path $backupDir 'server.env.backup') -Force
    Write-Step "Backup saved to $backupDir"

    if ($DryRun) {
        Write-Ok "Dry-run complete. Current commit is $script:BeforeCommit; no pull, install, stop, or restart was performed."
        exit 0
    }

    Write-Step 'Fetching origin/main...'
    Invoke-Native $Git @('-C', $RepoPath, 'fetch', 'origin', 'main') (Get-Location).Path
    $remote = (& $Git -C $RepoPath rev-parse origin/main).Trim()
    & $Git -C $RepoPath merge-base --is-ancestor $script:BeforeCommit $remote
    if ($LASTEXITCODE -ne 0) { throw "Local main is not an ancestor of origin/main. Refusing non-fast-forward update. Local=$script:BeforeCommit Remote=$remote" }
    if ($remote -eq $script:BeforeCommit) {
        Write-Ok "Already up to date at $script:BeforeCommit. Backend was not restarted."
        exit 0
    }

    Write-Step "Fast-forwarding main to $remote..."
    Invoke-Native $Git @('-C', $RepoPath, 'pull', '--ff-only', 'origin', 'main') (Get-Location).Path
    $script:AfterCommit = (& $Git -C $RepoPath rev-parse HEAD).Trim()
    if ($script:AfterCommit -ne $remote) { throw "Unexpected post-pull HEAD: $script:AfterCommit (expected $remote)" }
    $script:PulledNewCommit = $true

    Write-Step 'Checking backend syntax...'
    Invoke-Native $Node @('--check', $ServerEntry) $ServerPath
    Invoke-Native $Node @('--check', (Join-Path $RepoPath 'server\game\monsterEngine.js')) $ServerPath

    Write-Step 'Installing backend production dependencies with npm.cmd...'
    Invoke-Native $Npm @('ci', '--omit=dev') $ServerPath

    if ($RunFrontendBuild) {
        Write-Step 'Installing frontend dependencies with npm.cmd...'
        Invoke-Native $Npm @('ci') $RepoPath
        Write-Step 'Building frontend dist for the VPS static server...'
        Invoke-Native $Npm @('run', 'build') $RepoPath
    }

    Stop-ZolosBackend
    Stop-ZolosFrontendIfRunning
    $script:StartedProcess = Start-ZolosBackend $Node $ServerPath $LogDir
    Start-Sleep -Seconds 3
    if (-not (Get-Process -Id $script:StartedProcess.Id -ErrorAction SilentlyContinue)) {
        $tail = if (Test-Path (Join-Path $LogDir 'server.err.log')) { (Get-Content (Join-Path $LogDir 'server.err.log') -Tail 60) -join "`n" } else { '(no stderr log)' }
        throw "Backend exited immediately:`n$tail"
    }

    Assert-ProbeHealthy 'Local backend' $LocalProbeUrl
    if (-not $SkipRemoteProbe) { Assert-ProbeHealthy 'Public backend' $ProbeUrl }
    if ($script:FrontendWasRunning) {
        $frontend = Start-ZolosFrontend $Node $RepoPath $LogDir
        Start-Sleep -Seconds 2
        if (-not (Get-Process -Id $frontend.Id -ErrorAction SilentlyContinue)) {
            $tail = if (Test-Path (Join-Path $LogDir 'frontend.err.log')) { (Get-Content (Join-Path $LogDir 'frontend.err.log') -Tail 40) -join "`n" } else { '(no stderr log)' }
            throw "Frontend static server exited immediately:`n$tail"
        }
        Write-Ok "Frontend static server restarted (PID=$($frontend.Id))."
    }

    Write-Ok "Backend update completed. Commit=$script:AfterCommit PID=$($script:StartedProcess.Id)"
    Write-Host "[ZOLOS] Logs: $LogDir" -ForegroundColor Gray
    Write-Host "[ZOLOS] Backup: $backupDir" -ForegroundColor Gray
    exit 0
} catch {
    Write-Host "`n[ZOLOS][STOP] $($_.Exception.Message)" -ForegroundColor Red
    if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ZOLOS][STOP] $($_.Exception.Message)" }

    if ($script:StartedProcess) {
        try { Stop-Process -Id $script:StartedProcess.Id -Force -ErrorAction SilentlyContinue } catch { }
    }

    if ($script:PulledNewCommit -and $script:BeforeCommit) {
        try {
            Write-Warn "Rolling back code to known-good commit $script:BeforeCommit..."
            & $Git -C $RepoPath reset --hard $script:BeforeCommit
            if ($LASTEXITCODE -eq 0) {
                & $Npm 'ci' '--omit=dev' '--prefix' (Join-Path $RepoPath 'server')
                $script:StartedProcess = Start-ZolosBackend $Node $ServerPath $LogDir
                if ($script:FrontendWasRunning) {
                    $rollbackFrontend = Start-ZolosFrontend $Node $RepoPath $LogDir
                    Write-Warn "Rollback frontend started with PID $($rollbackFrontend.Id)."
                }
                Write-Warn "Rollback backend started with PID $($script:StartedProcess.Id)."
            }
        } catch {
            Write-Host "[ZOLOS][CRITICAL] Automatic rollback could not complete: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    exit 1
}
