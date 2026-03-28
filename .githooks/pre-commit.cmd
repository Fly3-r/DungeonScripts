@echo off
setlocal
set "GIT=C:\Program Files\Git\cmd\git.exe"
set "NPM=C:\Program Files\nodejs\npm.cmd"

for /f "delims=" %%F in ('"%GIT%" diff --cached --name-only') do (
  echo %%F | findstr /b /c:"apps/extension/" >nul
  if not errorlevel 1 (
    echo %%F | findstr /b /c:"apps/extension/dist/" >nul
    if errorlevel 1 goto run_sync
  )
)

exit /b 0

:run_sync
call "%NPM%" run extension:sync:firefox
if errorlevel 1 exit /b %errorlevel%
"%GIT%" add --all apps/firefox-*
exit /b %errorlevel%
