@echo off
:: Change directory to the root of the repository where the batch file is located
cd /d "%~dp0"

echo ========================================================
echo          Git Commit ^& Sync Tool (git_sync.bat)
echo ========================================================
echo.

:: Show current repository status
echo [1/4] Checking current git status...
git status -s
echo.

:: Prompt user for commit message
set /p msg="[2/4] Enter commit message (or press Enter for 'Auto-sync update'): "
if "%msg%"=="" set msg=Auto-sync update
echo Selected commit message: "%msg%"
echo.

:: Stage all changes
echo [3/4] Adding changes to stash/stage...
git add -A
echo.

:: Commit changes
echo Committing changes...
git commit -v -m "%msg%"
echo.

:: Run git up command to pull (rebase) and push
echo [4/4] Syncing with remote repository (running 'git up')...
git up
echo.

echo ========================================================
echo Sync Completed successfully!
echo ========================================================
echo.
pause
