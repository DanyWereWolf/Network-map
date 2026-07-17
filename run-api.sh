#!/usr/bin/env bash
# Запуск сервера «Карта оптической сети» на Linux / macOS
# Запуск: ./run-api.sh   или   bash run-api.sh
#
# MySQL (опционально):
#   AUTO_MYSQL=1 ./run-api.sh     — без спроса: setup + migrate, если MySQL недоступен
#   SKIP_MYSQL_SETUP=1 ./run-api.sh — не предлагать установку MySQL

cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "============================================"
echo "  Карта оптической сети — запуск сервера"
echo "============================================"
echo ""

if ! command -v npm >/dev/null 2>&1; then
    echo "[ОШИБКА] npm не найден."
    echo ""
    echo "Установите Node.js: https://nodejs.org"
    echo "После установки перезапустите этот скрипт."
    echo ""
    read -r -p "Нажмите Enter для выхода..."
    exit 1
fi

if [ ! -d "node_modules/express" ] || [ ! -d "node_modules/mysql2" ]; then
    echo "Устанавливаю зависимости (первый запуск)..."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo "[ОШИБКА] Не удалось установить зависимости."
        read -r -p "Нажмите Enter для выхода..."
        exit 1
    fi
    echo ""
fi

# --- MySQL: если в конфиге storage=mysql, а сервер недоступен — предложить setup ---
need_mysql_setup() {
    node -e "
const fs = require('fs');
const path = require('path');
const cfgPath = path.join(process.cwd(), 'server-config.json');
let storage = 'json';
if (fs.existsSync(cfgPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    storage = String(process.env.STORAGE || cfg.storage || 'json').toLowerCase();
  } catch (e) {}
}
if (storage !== 'mysql' && process.env.AUTO_MYSQL !== '1') {
  process.exit(2); // not mysql mode
}
process.exit(0);
" 2>/dev/null
    return $?
}

mysql_reachable() {
    node -e "
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
(async () => {
  let m = { host: '127.0.0.1', port: 3306, user: 'root', password: '', database: 'network_map' };
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'server-config.json'), 'utf8'));
    if (cfg.mysql) m = Object.assign(m, cfg.mysql);
  } catch (e) {}
  m.host = process.env.MYSQL_HOST || m.host;
  m.port = parseInt(process.env.MYSQL_PORT || m.port || 3306, 10);
  m.user = process.env.MYSQL_USER || m.user;
  m.password = process.env.MYSQL_PASSWORD != null ? process.env.MYSQL_PASSWORD : (m.password || '');
  m.database = process.env.MYSQL_DATABASE || m.database;
  let conn;
  try {
    conn = await mysql.createConnection({
      host: m.host, port: m.port, user: m.user, password: m.password,
      connectTimeout: 3000
    });
    await conn.query('SELECT 1');
    process.exit(0);
  } catch (e) {
    process.exit(1);
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
})();
" 2>/dev/null
    return $?
}

run_mysql_setup() {
    if [ ! -f "scripts/setup-mysql-linux.sh" ]; then
        echo "[MySQL] Скрипт scripts/setup-mysql-linux.sh не найден."
        return 1
    fi
    echo ""
    echo "[MySQL] Запуск установки / миграции (нужен sudo)…"
    echo ""
    if [ "$(id -u)" -eq 0 ]; then
        bash scripts/setup-mysql-linux.sh
    else
        sudo bash scripts/setup-mysql-linux.sh
    fi
}

if [ "${SKIP_MYSQL_SETUP:-0}" != "1" ]; then
    need_mysql_setup
    nm_status=$?
    if [ "$nm_status" -eq 0 ]; then
        if mysql_reachable; then
            echo "[MySQL] Подключение OK (storage=mysql)"
            echo ""
        else
            echo "[MySQL] storage=mysql, но сервер БД недоступен."
            do_setup=0
            if [ "${AUTO_MYSQL:-0}" = "1" ]; then
                do_setup=1
            elif [ -t 0 ]; then
                echo ""
                read -r -p "Установить MySQL и мигрировать data/store.json? [y/N] " ans
                case "$ans" in
                    y|Y|yes|YES) do_setup=1 ;;
                esac
            else
                echo "[MySQL] Нет TTY. Для авто-setup: AUTO_MYSQL=1 ./run-api.sh"
            fi
            if [ "$do_setup" -eq 1 ]; then
                if ! run_mysql_setup; then
                    echo "[ОШИБКА] Setup MySQL не удался."
                    exit 1
                fi
                if ! mysql_reachable; then
                    echo "[ОШИБКА] MySQL всё ещё недоступен после setup."
                    exit 1
                fi
                echo "[MySQL] Готово."
                echo ""
            else
                echo "[MySQL] Пропуск. Сервер может не стартовать без БД."
                echo ""
            fi
        fi
    elif [ "${AUTO_MYSQL:-0}" = "1" ]; then
        # Явно попросили авто-MySQL, даже если storage ещё json
        if ! mysql_reachable; then
            echo "[MySQL] AUTO_MYSQL=1 — установка и миграция…"
            if ! run_mysql_setup; then
                echo "[ОШИБКА] Setup MySQL не удался."
                exit 1
            fi
        else
            # MySQL есть, но storage может быть json — переключить и мигрировать при наличии store
            echo "[MySQL] AUTO_MYSQL=1 — настройка storage и миграция…"
            if [ "$(id -u)" -eq 0 ]; then
                SKIP_APT=1 bash scripts/setup-mysql-linux.sh
            else
                sudo SKIP_APT=1 bash scripts/setup-mysql-linux.sh
            fi
        fi
        echo ""
    fi
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
