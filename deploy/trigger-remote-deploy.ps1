[CmdletBinding()]
param(
    [string]$DeployUrl = 'https://rt.zolos.online/api/admin/deploy',
    [string]$RequestId = ''
)

$ErrorActionPreference = 'Stop'
$secret = [Environment]::GetEnvironmentVariable('ZOLOS_DEPLOY_WEBHOOK_SECRET')
if ([string]::IsNullOrWhiteSpace($secret) -or $secret.Length -lt 32) {
    throw 'Set ZOLOS_DEPLOY_WEBHOOK_SECRET in the current user or machine environment first.'
}
if ([string]::IsNullOrWhiteSpace($RequestId)) {
    $RequestId = [guid]::NewGuid().ToString('N')
}
if ($RequestId -notmatch '^[A-Za-z0-9._:-]{8,128}$') { throw 'RequestId contains invalid characters.' }

$body = '{"action":"update","ref":"main"}'
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$payload = "${timestamp}.${body}"
$hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
try {
    $digest = -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload)) | ForEach-Object { $_.ToString('x2') })
} finally { $hmac.Dispose() }

$result = Invoke-RestMethod -Method Post -Uri $DeployUrl -ContentType 'application/json' `
    -Headers @{
        'X-Zolos-Deploy-Timestamp' = $timestamp
        'X-Zolos-Deploy-Signature' = "sha256=$digest"
        'X-Zolos-Deploy-Idempotency' = $RequestId
    } -Body $body -TimeoutSec 20

if ($result.ok -ne $true) { throw 'VPS did not accept the deployment request.' }
Write-Host "VPS accepted deployment request $RequestId ($($result.status))."
