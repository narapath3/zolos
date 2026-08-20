@echo off
setlocal
set "REPO=C:\Users\Administrator\Desktop\zolos"
set "RAW=https://raw.githubusercontent.com/narapath3/zolos/main/deploy/update-backend-one-click.ps1"
set "SCRIPT=%TEMP%\zolos-update-backend-one-click.ps1"

echo [ZOLOS] Downloading the signed-in-repository updater...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%RAW%' -OutFile '%SCRIPT%'; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo [ZOLOS][STOP] Could not download updater from GitHub.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -RepoPath "%REPO%" -RunFrontendBuild
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" (
  echo.
  echo [ZOLOS][OK] Game update completed: frontend build, backend restart, and RPC route verified.
) else (
  echo.
  echo [ZOLOS][STOP] Update stopped safely. Automatic rollback was attempted if the new commit was already pulled.
)
pause
exit /b %RC%
