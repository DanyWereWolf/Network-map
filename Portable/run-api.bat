@echo off
rem ASCII + CRLF only. Cyrillic in this file breaks cmd.exe. Texts: scripts\portable-echo.ps1
if not "%~1"=="INTERNAL" (
    start "Network Map Portable" cmd /k "%~f0" INTERNAL
    exit /b 0
)

cd /d "%~dp0"
setlocal EnableExtensions

rem Do not inherit PORT from an IDE or parent terminal
set "PORT="
set "HOST="

rem Portable Node version used when the system Node is missing or too old
set "NODE_DIST_VERSION=22.23.3"
set "REQUIRED_NODE_MAJOR=20"
set "REQUIRED_NODE_MINOR=9"

call :msg banner

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-local-node.ps1" -RootDir "%~dp0." -Version "%NODE_DIST_VERSION%" -RequiredMajor %REQUIRED_NODE_MAJOR% -RequiredMinor %REQUIRED_NODE_MINOR%
if errorlevel 1 goto :stay

rem Put the local runtime on PATH only when the system Node is unusable
set "USE_LOCAL_NODE=0"
where node >nul 2>&1
if errorlevel 1 set "USE_LOCAL_NODE=1"
where npm >nul 2>&1
if errorlevel 1 set "USE_LOCAL_NODE=1"
if "%USE_LOCAL_NODE%"=="0" (
    node -e "var p=process.versions.node.split('.').map(Number); if(p[0]<20||(p[0]===20&&p[1]<9)) process.exit(1)" >nul 2>&1
    if errorlevel 1 set "USE_LOCAL_NODE=1"
)
if "%USE_LOCAL_NODE%"=="1" (
    if exist "%~dp0.runtime\node\node.exe" (
        set "PATH=%~dp0.runtime\node;%PATH%"
        call :msg node-local
    )
)

where node >nul 2>&1
if errorlevel 1 (
    call :msg err-no-node
    goto :stay
)

where npm >nul 2>&1
if errorlevel 1 (
    call :msg err-no-npm
    goto :stay
)

for /f "delims=" %%v in ('node -p "process.versions.node" 2^>nul') do set "NODE_VER=%%v"
echo [Node] v%NODE_VER%
node -e "var p=process.versions.node.split('.').map(Number); if(p[0]<20||(p[0]===20&&p[1]<9)) process.exit(1)" >nul 2>&1
if errorlevel 1 (
    call :msg err-node-old %NODE_VER%
    goto :stay
)
echo.

set "NEED_INSTALL=0"
if not exist "node_modules\express" set "NEED_INSTALL=1"
if not exist "node_modules\ws" set "NEED_INSTALL=1"
if not exist "node_modules\argon2" set "NEED_INSTALL=1"
if not exist "node_modules\cors" set "NEED_INSTALL=1"
if not exist "node_modules\multer" set "NEED_INSTALL=1"
if not exist "node_modules\mysql2" set "NEED_INSTALL=1"
if not exist "node_modules\sharp" set "NEED_INSTALL=1"
if not exist "node_modules\geotiff" set "NEED_INSTALL=1"
if not exist "node_modules\sanitize-html" set "NEED_INSTALL=1"
if not exist "node_modules\speakeasy" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="1" (
    call :msg installing
    call npm.cmd install --omit=dev
    if errorlevel 1 (
        call :msg err-npm-install
        goto :stay
    )
    echo.
) else (
    call :msg deps-ok
)

call :msg prepare
node scripts\ensure-first-run.js
if errorlevel 1 goto :stay
echo.

for /f "delims=" %%p in ('node -e "try{var c=require('./server-config.json');console.log(c.port||3000)}catch(e){console.log(3000)}"') do set "APP_PORT=%%p"
if "%APP_PORT%"=="" set "APP_PORT=3000"

call :msg starting %APP_PORT%

rem node directly - more reliable than npm.cmd run on some Windows setups
node server\server-api.js
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    call :msg err-server %EXITCODE%
)

:stay
echo.
pause
endlocal
exit /b 0

:msg
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\portable-echo.ps1" %1 %2
exit /b 0
