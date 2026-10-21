@echo off
:: Запуск Portable: зависимости, конфиг, data/, сервер
if not "%1"=="INTERNAL" (
    start "Карта оптической сети — Portable" cmd /k "%~f0" INTERNAL
    exit /b 0
)

chcp 65001 >nul
cd /d "%~dp0"
setlocal EnableExtensions

:: Не наследуем чужой PORT из окружения IDE/терминала
set PORT=
set HOST=

echo ============================================
echo   Карта оптической сети — Portable
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [Ошибка] Node.js не найден.
    echo Установите Node.js 20 LTS или новее: https://nodejs.org
    echo После установки закройте и снова откройте этот файл.
    goto :stay
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [Ошибка] npm не найден ^(обычно ставится вместе с Node.js^).
    echo Установите Node.js: https://nodejs.org
    goto :stay
)

for /f "delims=" %%v in ('node -p "process.versions.node" 2^>nul') do set NODE_VER=%%v
echo [Node] v%NODE_VER%
node -e "var p=process.versions.node.split('.').map(Number); if(p[0]<20||(p[0]===20&&p[1]<9)){console.error('[Ошибка] Нужен Node.js >= 20.9, сейчас v'+process.versions.node); process.exit(1)}"
if errorlevel 1 goto :stay
echo.

set NEED_INSTALL=0
if not exist "node_modules\express" set NEED_INSTALL=1
if not exist "node_modules\ws" set NEED_INSTALL=1
if not exist "node_modules\argon2" set NEED_INSTALL=1
if not exist "node_modules\cors" set NEED_INSTALL=1
if not exist "node_modules\multer" set NEED_INSTALL=1
if not exist "node_modules\mysql2" set NEED_INSTALL=1
if not exist "node_modules\sharp" set NEED_INSTALL=1
if not exist "node_modules\geotiff" set NEED_INSTALL=1
if not exist "node_modules\sanitize-html" set NEED_INSTALL=1
if not exist "node_modules\speakeasy" set NEED_INSTALL=1

if "%NEED_INSTALL%"=="1" (
    echo Устанавливаем зависимости npm ^(первый запуск^)...
    echo Это может занять несколько минут.
    echo.
    call npm.cmd install --omit=dev
    if errorlevel 1 (
        echo.
        echo [Ошибка] Не удалось установить зависимости.
        echo Проверьте интернет и права на запись в эту папку.
        goto :stay
    )
    echo.
) else (
    echo Зависимости npm уже установлены.
    echo.
)

echo Подготовка конфига и папок данных...
node scripts\ensure-first-run.js
if errorlevel 1 goto :stay
echo.

for /f "delims=" %%p in ('node -e "try{var c=require('./server-config.json');console.log(c.port||3000)}catch(e){console.log(3000)}"') do set APP_PORT=%%p
if "%APP_PORT%"=="" set APP_PORT=3000

echo Запускаем сервер...
echo.
echo ============================================
echo   Откройте:  http://localhost:%APP_PORT%
echo   Логин:     admin
echo   Пароль:    admin123  ^(если не меняли в server-config.json^)
echo   Остановка: Ctrl+C
echo ============================================
echo.

:: Напрямую node — надёжнее, чем npm.cmd run на части Windows
node server\server-api.js
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
    echo [Ошибка] Сервер завершился с кодом %EXITCODE%.
    echo Если порт занят — измените "port" в server-config.json или закройте другой процесс.
)

:stay
echo.
pause
endlocal
