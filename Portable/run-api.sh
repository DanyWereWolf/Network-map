#!/usr/bin/env bash
# Запуск Portable на Linux / macOS
# Запуск: ./run-api.sh   или   bash run-api.sh

set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
REQUIRED_NODE_MAJOR=20
REQUIRED_NODE_MINOR=9

# Не наследуем PORT из окружения IDE — берём из server-config.json
unset PORT
unset HOST

echo "============================================"
echo "  Карта оптической сети — Portable"
echo "============================================"
echo ""

if [ "$(id -u)" -eq 0 ]; then
    echo "[Внимание] Запуск от root. Лучше обычный пользователь."
    echo ""
fi

node_major() {
    if ! command -v node >/dev/null 2>&1; then echo 0; return; fi
    node -p "parseInt(process.versions.node.split('.')[0],10)||0" 2>/dev/null || echo 0
}
node_minor() {
    if ! command -v node >/dev/null 2>&1; then echo 0; return; fi
    node -p "parseInt(process.versions.node.split('.')[1],10)||0" 2>/dev/null || echo 0
}

major="$(node_major)"
minor="$(node_minor)"
need_node=0
if [ "$major" -lt "$REQUIRED_NODE_MAJOR" ]; then need_node=1; fi
if [ "$major" -eq "$REQUIRED_NODE_MAJOR" ] && [ "$minor" -lt "$REQUIRED_NODE_MINOR" ]; then need_node=1; fi
if [ "$need_node" -eq 1 ] || ! command -v npm >/dev/null 2>&1; then
    echo "[Ошибка] Нужен Node.js >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR} и npm."
    if command -v node >/dev/null 2>&1; then echo "Сейчас: $(node -v)"; else echo "Node.js не найден."; fi
    echo "Установите: https://nodejs.org"
    exit 1
fi

echo "[Node] $(node -v) / npm $(npm -v)"
echo ""

need_npm_install=0
for pkg in express ws argon2 cors multer mysql2 sharp geotiff sanitize-html speakeasy; do
    if [ ! -d "node_modules/$pkg" ]; then
        need_npm_install=1
        break
    fi
done

if [ "$need_npm_install" -eq 1 ]; then
    echo "Устанавливаем зависимости npm (первый запуск)..."
    echo ""
    if ! npm install --omit=dev; then
        echo "[Ошибка] Не удалось установить зависимости."
        echo "Если ранее запускали от root:"
        echo "  sudo chown -R \"\$(whoami):\$(id -gn)\" \"$ROOT\""
        echo "  rm -rf node_modules && ./run-api.sh"
        exit 1
    fi
    echo ""
else
    echo "Зависимости npm уже установлены."
    echo ""
fi

echo "Подготовка конфига и папок данных..."
node scripts/ensure-first-run.js
echo ""

APP_PORT="$(node -e "try{var c=require('./server-config.json');console.log(c.port||3000)}catch(e){console.log(3000)}")"

echo "Запускаем сервер..."
echo ""
echo "============================================"
echo "  Откройте:  http://localhost:${APP_PORT}"
echo "  Логин:     admin"
echo "  Пароль:    admin123  (если не меняли в server-config.json)"
echo "  В сети:    http://ВАШ_IP:${APP_PORT}"
echo "  Остановка: Ctrl+C"
echo "============================================"
echo ""

# Напрямую node — без npm run (preapi уже выполнен выше)
exec node server/server-api.js
