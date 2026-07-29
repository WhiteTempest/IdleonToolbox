@echo off
REM Stop the self-hosted IdleonToolbox by killing whatever holds port 3001.
REM The trailing space in ":3001 " matters -- without it this also matches :30011 etc.

set FOUND=

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":3001 .*LISTENING"') do (
  taskkill /F /T /PID %%a >nul 2>&1 && set FOUND=1 && echo Stopped PID %%a
)

if not defined FOUND echo Nothing was listening on port 3001.

REM ponytail: ping, not timeout -- timeout.exe dies on redirected stdin and gets
REM shadowed by GNU coreutils on PATH. This idiom survives both.
ping -n 3 127.0.0.1 >nul
