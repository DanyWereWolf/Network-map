@echo off
:: Открыть в новом окне, которое не закроется
if not "%1"=="INTERNAL" (
    start "Сервер Карта сети" cmd /k "%~f0" INTERNAL
    exit /b 0
)

chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Карта сети - запуск сервера
echo ============================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] npm не найден.
    echo.
    echo Установите Node.js: https://nodejs.org
    echo После установки перезапустите этот файл.
    echo.
    goto :stay
)

if not exist "node_modules\express" (
    echo Устанавливаю зависимости ^(первый запуск^)...
    echo.
    npm install
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить зависимости.
        goto :stay
    )
    echo.
)

echo Запускаю сервер...
echo.
echo Когда появится строка: Приложение и API: http://localhost:3000
echo откройте в браузере:  http://localhost:3000
echo.
echo Не закрывайте это окно пока пользуетесь приложением.
echo ============================================
echo.

npm run api

echo.
echo Сервер остановлен.

:stay
echo.
pause
