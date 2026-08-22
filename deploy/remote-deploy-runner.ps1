[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\Users\Administrator\Desktop\zolos'
)

$ErrorActionPreference = 'Stop'
$RepoPath = [IO.Path]::GetFullPath($RepoPath)
$Batch = Join-Path $RepoPath 'deploy\ZOLOS-Update-Backend-OneClick.bat'
$LogDir = Join-Path $RepoPath 'logs'
$RunnerLog = Join-Path $LogDir 'remote-deploy-runner.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$started = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Content -LiteralPath $RunnerLog -Value "[$started] remote deploy task started"
$mutex = [Threading.Mutex]::new($false, 'Global\ZOLOS-RemoteDeploy')
$hasLock = $false

try {
    $hasLock = $mutex.WaitOne(0)
    if (-not $hasLock) {
        Add-Content -LiteralPath $RunnerLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] another deploy is already running; exiting safely"
        exit 0
    }
    if (-not (Test-Path $Batch)) { throw "Missing updater: $Batch" }
    $process = Start-Process -FilePath 'cmd.exe' -WorkingDirectory $RepoPath `
        -ArgumentList @('/d', '/c', 'call', $Batch, '-NoPause') `
        -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "updater exited with code $($process.ExitCode)" }
    Add-Content -LiteralPath $RunnerLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] remote deploy task completed"
    exit 0
} catch {
    Add-Content -LiteralPath $RunnerLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] remote deploy task failed: $($_.Exception.Message)"
    exit 1
} finally {
    if ($hasLock) { try { $mutex.ReleaseMutex() } catch { } }
    $mutex.Dispose()
}
