@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "DEST=private-agent-console"
set "PIN="
for /f "delims=" %%K in ('ssh -o "BatchMode yes" -o "ConnectTimeout 15" -o "StrictHostKeyChecking yes" %DEST% "cat /opt/private-agent-console/ssh-public-pin"') do set "PIN=%%K"
if not defined PIN goto :failed
call :probe
if not errorlevel 1 goto :ready
powershell -NoProfile -Command "Start-Process ssh -WindowStyle Hidden -ArgumentList '-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=2 -N -L 127.0.0.1:443:/opt/private-agent-console/ssh-bridge/console.sock %DEST%'"
for /l %%I in (1,1,14) do (
  ping -n 2 127.0.0.1 >nul
  call :probe
  if not errorlevel 1 goto :ready
)
goto :failed
:probe
curl.exe --silent --fail --tlsv1.3 --noproxy "*" --insecure --pinnedpubkey "sha256//%PIN%" --connect-timeout 6 --max-time 10 --resolve localhost:443:127.0.0.1 https://localhost/ >nul 2>nul
exit /b %errorlevel%
:ready
if /i "%~1"=="--test" exit /b 0
set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" goto :failed
start "" "%BROWSER%" --user-data-dir="%LOCALAPPDATA%\PrivateAgentConsole\Browser" --ignore-certificate-errors-spki-list="%PIN%" --host-resolver-rules="MAP localhost 127.0.0.1" --no-first-run --no-default-browser-check --app=https://localhost/
exit /b 0
:failed
echo Private connection unavailable. Check your SSH connection, local port 443 and whether the console has switched to Tailscale.
if /i not "%~1"=="--test" pause
exit /b 1
