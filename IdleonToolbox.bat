@echo off
REM Self-host IdleonToolbox on http://localhost:3001
REM Serves the static export (next.config.js sets output:'export'), so this is
REM just a file server -- no backend, no Node runtime needed after the build.
REM ponytail: builds only when out\ is missing. Delete out\ to force a rebuild.

cd /d "%~dp0"

if not exist "out\index.html" (
  echo Building static export -- takes about a minute, one time only...
  call npm run build
  if errorlevel 1 (
    echo.
    echo BUILD FAILED. If dependencies changed, run: npm ci
    pause
    exit /b 1
  )
)

echo.
echo   IdleonToolbox -^> http://localhost:3001
echo   Close this window, or run IdleonToolboxKill.bat, to stop it.
echo.

REM Open the browser a few seconds later, once the server is actually up.
REM ponytail: ping, not timeout -- see IdleonToolboxKill.bat for why.
start /min "" cmd /c "ping -n 3 127.0.0.1 >nul && explorer http://localhost:3001"

REM Exact version pin: @latest is a moving tag, so npx asks the registry every
REM boot (~10s); a pinned version + --prefer-offline runs from cache (~1.5s).
REM Bump the pin by hand if serve ever needs updating -- it's a file server.
npx --yes --prefer-offline serve@14.2.6 out -l 3001
