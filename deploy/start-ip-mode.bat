@echo off
REM ============================================================
REM  Zolos — Direct-IP mode launcher
REM  Frontend (port 80) + Realtime socket server (port 3001)
REM  Players join at:  http://103.58.150.195
REM ============================================================
cd /d "%~dp0.."

echo [Zolos] Starting realtime socket server (port 3001)...
start "Zolos Socket 3001" cmd /k "cd /d %~dp0..\server && node --env-file=.env server.js"

timeout /t 2 >nul

echo [Zolos] Starting frontend static server (port 80)...
start "Zolos Frontend 80" cmd /k "cd /d %~dp0.. && node deploy\static-server.mjs"

echo.
echo [Zolos] Both started. Players join at: http://103.58.150.195
echo [Zolos] Close the two opened windows to stop.
pause
