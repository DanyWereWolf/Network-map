#!/usr/bin/env bash
# Запуск сервера «Карта оптической сети» на Linux / macOS
# Запуск: ./run-api.sh   или   bash run-api.sh
#
# MySQL (опционально):
#   AUTO_MYSQL=1 ./run-api.sh     — без спроса: setup + migrate, если MySQL недоступен
#   SKIP_MYSQL_SETUP=1 ./run-api.sh — не предлагать установку MySQL

cd "$(dirname "$0")"
ROOT="$(pwd)"
REQUIRED_NODE_MAJOR=20
NVM_VERSION="v0.40.1"

echo "============================================"
echo "  Карта оптической сети — запуск сервера"
echo "============================================"
echo ""

if [ "$(id -u)" -eq 0 ]; then
    echo "[ВНИМАНИЕ] Запуск от root (sudo). Лучше: ./run-api.sh от пользователя volsmap."
    echo "Иначе node_modules часто ломается правами (EACCES)."
    echo ""
fi

load_nvm() {
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        # shellcheck disable=SC1090
        . "$NVM_DIR/nvm.sh"
        return 0
    fi
    return 1
}

node_major() {
    if ! command -v node >/dev/null 2>&1; then
        echo 0
        return
    fi
    node -p "parseInt(process.versions.node.split('.')[0],10)||0" 2>/dev/null || echo 0
}

ensure_node() {
    load_nvm || true
    local major
    major="$(node_major)"
    if [ "$major" -ge "$REQUIRED_NODE_MAJOR" ] && command -v npm >/dev/null 2>&1; then
        echo "[Node] $(node -v) / npm $(npm -v)"
        echo ""
        return 0
    fi

    if [ "$major" -gt 0 ]; then
        echo "[Node] Сейчас $(node -v) — нужен ≥ ${REQUIRED_NODE_MAJOR}. Устанавливаю Node ${REQUIRED_NODE_MAJOR}…"
    else
        echo "[Node] Node.js не найден. Устанавливаю Node ${REQUIRED_NODE_MAJOR}…"
    fi
    echo ""

    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        echo "[ОШИБКА] Нужен curl или wget для установки Node."
        return 1
    fi

    if ! load_nvm; then
        echo "[Node] Ставлю nvm (${NVM_VERSION})…"
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
        else
            wget -qO- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
        fi
        if ! load_nvm; then
            echo "[ОШИБКА] nvm не загрузился после установки ($HOME/.nvm)."
            return 1
        fi
    fi

    nvm install "$REQUIRED_NODE_MAJOR"
    nvm alias default "$REQUIRED_NODE_MAJOR" >/dev/null 2>&1 || true
    nvm use "$REQUIRED_NODE_MAJOR"

    major="$(node_major)"
    if [ "$major" -lt "$REQUIRED_NODE_MAJOR" ] || ! command -v npm >/dev/null 2>&1; then
        echo "[ОШИБКА] Не удалось переключиться на Node ≥ ${REQUIRED_NODE_MAJOR}."
        return 1
    fi
    echo "[Node] Готово: $(node -v) / npm $(npm -v)"
    echo ""
    return 0
}

ensure_deps() {
    local need_npm_install=0
    local pkg
    for pkg in express multer mysql2 cors ws argon2 geotiff sharp sanitize-html nodemailer speakeasy; do
        if [ ! -d "node_modules/$pkg" ]; then
            need_npm_install=1
            break
        fi
    done

    if [ "$need_npm_install" -eq 0 ]; then
        return 0
    fi

    echo "Устанавливаю зависимости npm (если нет — автоматически)…"
    echo ""
    if ! npm install --omit=dev; then
        echo ""
        echo "[ОШИБКА] Не удалось установить зависимости."
        echo "Частая причина: права на node_modules (раньше ставили под sudo)."
        echo "Исправление:"
        echo "  sudo chown -R \"\$(whoami):\$(id -gn)\" \"$ROOT\""
        echo "  rm -rf node_modules"
        echo "  ./run-api.sh"
        echo ""
        return 1
    fi
    echo ""
    return 0
}

if ! ensure_node; then
    read -r -p "Нажмите Enter для выхода..."
    exit 1
fi

if ! ensure_deps; then
    read -r -p "Нажмите Enter для выхода..."
    exit 1
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
