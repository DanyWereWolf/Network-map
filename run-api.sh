#!/bin/sh
# Запуск сервера «Карта сети» на Linux / macOS
# Запуск: ./run-api.sh   или   sh run-api.sh

cd "$(dirname "$0")"

echo "============================================"
echo "  Карта сети - запуск сервера"
echo "============================================"
echo ""

if ! command -v npm >/dev/null 2>&1; then
    echo "[ОШИБКА] npm не найден."
    echo ""
    echo "Установите Node.js: https://nodejs.org"
    echo "После установки перезапустите этот скрипт."
    echo ""
    read -p "Нажмите Enter для выхода..."
    exit 1
fi

if [ ! -d "node_modules/express" ]; then
    echo "Устанавливаю зависимости (первый запуск)..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo "[ОШИБКА] Не удалось установить зависимости."
        read -p "Нажмите Enter для выхода..."
        exit 1
    fi
    echo ""
fi

echo "Запускаю сервер..."
echo ""
echo "Когда появятся строки с адресами:"
echo "  - Локально:  http://localhost:3000"
echo "  - В сети:    http://ВАШ_IP:3000  (например http://10.208.0.18:3000)"
echo "На этом ПК откройте localhost; на других устройствах - адрес «В сети»."
echo ""
echo "Не закрывайте этот терминал пока пользуетесь приложением."
echo "Остановка: Ctrl+C"
echo "============================================"
echo ""

npm run api

echo ""
echo "Сервер остановлен."
