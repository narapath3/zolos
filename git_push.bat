@echo off
cd /d "c:\Users\Admin\Desktop\zolos"

REM Stage, commit, push
git add -A
git commit -m "feat: add mobile pad controls (virtual joystick, skill buttons, sprint toggle)"
git push

rem Reset remote to original (if changed)
git remote set-url origin https://github.com/narapath3/zolos.git


echo.
echo ========== DONE ==========
echo.
pause
