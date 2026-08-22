# ZOLOS Remote Deploy Webhook installer
# Run once in an elevated PowerShell on the Windows VPS.
[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\Users\Administrator\Desktop\zolos',
    [string]$TaskName = '\ZOLOS-RemoteDeploy',
    [switch]$RotateSecret
)

$ErrorActionPreference = 'Stop'
$RepoPath = [IO.Path]::GetFullPath($RepoPath)
$ServerEnv = Join-Path $RepoPath 'server\.env'
$Runner = Join-Path $RepoPath 'deploy\remote-deploy-runner.ps1'
$SecretDir = Join-Path $env:ProgramData 'ZOLOS'
$SecretFile = Join-Path $SecretDir 'remote-deploy-webhook.secret'

function Require-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this installer from an elevated PowerShell (Run as Administrator).'
    }
}

function New-WebHookSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Get-EnvValue([string]$Key) {
    if (-not (Test-Path $ServerEnv)) { return '' }
    $pattern = '^' + [regex]::Escape($Key) + '=(.*)$'
    foreach ($line in @(Get-Content -LiteralPath $ServerEnv)) {
        if ($line -match $pattern) { return $Matches[1].Trim().Trim('"') }
    }
    return ''
}

function Set-EnvValue([string]$Key, [string]$Value) {
    $lines = @(if (Test-Path $ServerEnv) { Get-Content -LiteralPath $ServerEnv } else { @() })
    $pattern = '^' + [regex]::Escape($Key) + '='
    $found = $false
    $updated = @($lines | ForEach-Object {
        if ($_ -match $pattern) {
            $found = $true
            "{0}={1}" -f $Key, $Value
        } else { $_ }
    })
    if (-not $found) { $updated += ("{0}={1}" -f $Key, $Value) }
    $utf8 = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllLines($ServerEnv, $updated, $utf8)
    Write-Host "[ZOLOS] Configured $Key in server/.env"
}

Require-Admin
if (-not (Test-Path (Join-Path $RepoPath '.git'))) { throw "Not a Git repository: $RepoPath" }
if (-not (Test-Path $ServerEnv)) { throw "Missing server/.env: $ServerEnv" }
if (-not (Test-Path $Runner)) { throw "Missing remote deploy runner: $Runner" }

New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
$existingEnvSecret = Get-EnvValue 'ZOLOS_DEPLOY_WEBHOOK_SECRET'
$secret = if (-not $RotateSecret -and (Test-Path $SecretFile)) {
    (Get-Content -LiteralPath $SecretFile -Raw).Trim()
} elseif (-not $RotateSecret -and $existingEnvSecret.Length -ge 32) {
    $existingEnvSecret
} else {
    New-WebHookSecret
}
if ($secret.Length -lt 32) { throw 'The existing webhook secret is too short; rerun with -RotateSecret.' }

Set-Content -LiteralPath $SecretFile -Value $secret -Encoding ascii -NoNewline
$acl = Get-Acl -LiteralPath $SecretFile
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner([Security.Principal.NTAccount]'BUILTIN\Administrators')
$acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
$inheritance = [Security.AccessControl.InheritanceFlags]::None
$propagation = [Security.AccessControl.PropagationFlags]::None
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new('SYSTEM', 'FullControl', $inheritance, $propagation, 'Allow'))
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new('BUILTIN\Administrators', 'FullControl', $inheritance, $propagation, 'Allow'))
Set-Acl -LiteralPath $SecretFile -AclObject $acl

Set-EnvValue 'ZOLOS_DEPLOY_WEBHOOK_SECRET' $secret
Set-EnvValue 'ZOLOS_DEPLOY_REPO_PATH' $RepoPath
Set-EnvValue 'ZOLOS_DEPLOY_TASK_NAME' $TaskName

$taskPath = Split-Path -Parent $TaskName
if ([string]::IsNullOrWhiteSpace($taskPath)) { $taskPath = '\' }
$taskLeaf = Split-Path -Leaf $TaskName
$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoLogo -NoProfile -ExecutionPolicy Bypass -File "{0}" -RepoPath "{1}"' -f $Runner, $RepoPath)
# schtasks.exe has no ONDEMAND schedule type. A one-time trigger far in the
# future makes the task dormant; the webhook starts it explicitly with /Run.
$taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddYears(10)
Register-ScheduledTask -TaskName $taskLeaf -TaskPath $taskPath -Action $taskAction `
    -Trigger $taskTrigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

Write-Host ''
Write-Host '[ZOLOS][OK] Remote deploy Scheduled Task is installed.' -ForegroundColor Green
Write-Host "[ZOLOS] Task: $TaskName"
Write-Host "[ZOLOS] Secret file: $SecretFile"
Write-Host '[ZOLOS] Copy the secret into GitHub Actions > Settings > Secrets and variables > Actions.'
Write-Host '[ZOLOS] Secret name: ZOLOS_DEPLOY_WEBHOOK_SECRET'
Write-Host '[ZOLOS] Keep the secret file private. Do not commit it or paste it into chat.'
Write-Host '[ZOLOS] Restart the backend once after adding the .env values, then use the GitHub Actions workflow.'
