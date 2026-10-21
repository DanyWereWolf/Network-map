#!/usr/bin/env bash
# Запуск Portable на Linux / macOS
# Запуск: ./run-api.sh   или   bash run-api.sh

set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
REQUIRED_NODE_MAJOR=20
REQUIRED_NODE_MINOR=9
NODE_DIST_VERSION="${NODE_DIST_VERSION:-22.23.3}"
RUNTIME_DIR="$ROOT/.runtime/node"
MARKER="$RUNTIME_DIR/.portable-node-version"

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

node_version_of() {
    local exe="$1"
    if [ -z "$exe" ] || [ ! -x "$exe" ]; then echo ""; return; fi
    "$exe" -p "process.versions.node" 2>/dev/null || echo ""
}

node_ok() {
    local ver="$1"
    [ -n "$ver" ] || return 1
    local major minor
    major="$(printf '%s' "$ver" | cut -d. -f1)"
    minor="$(printf '%s' "$ver" | cut -d. -f2)"
    major="${major:-0}"
    minor="${minor:-0}"
    if [ "$major" -lt "$REQUIRED_NODE_MAJOR" ]; then return 1; fi
    if [ "$major" -eq "$REQUIRED_NODE_MAJOR" ] && [ "$minor" -lt "$REQUIRED_NODE_MINOR" ]; then return 1; fi
    return 0
}

system_node_ok() {
    local sys_node sys_ver
    sys_node="$(command -v node 2>/dev/null || true)"
    [ -n "$sys_node" ] || return 1
    command -v npm >/dev/null 2>&1 || return 1
    sys_ver="$(node_version_of "$sys_node")"
    node_ok "$sys_ver"
}

detect_platform() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"
    case "$os" in
        linux*) os=linux ;;
        darwin*) os=darwin ;;
        *)
            echo "[Ошибка] Неподдерживаемая ОС: $(uname -s)" >&2
            return 1
            ;;
    esac
    case "$arch" in
        x86_64|amd64) arch=x64 ;;
        aarch64|arm64) arch=arm64 ;;
        *)
            echo "[Ошибка] Неподдерживаемая архитектура: $arch (нужны x64 или arm64)" >&2
            return 1
            ;;
    esac
    printf '%s %s' "$os" "$arch"
}

download_file() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "$dest" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$dest" "$url"
    else
        echo "[Ошибка] Нужен curl или wget для скачивания Node.js." >&2
        return 1
    fi
}

install_local_node() {
    local plat os arch archive url tmp archive_path extract_dir inner local_ver
    plat="$(detect_platform)" || return 1
    os="$(printf '%s' "$plat" | cut -d' ' -f1)"
    arch="$(printf '%s' "$plat" | cut -d' ' -f2)"
    archive="node-v${NODE_DIST_VERSION}-${os}-${arch}.tar.gz"
    url="https://nodejs.org/dist/v${NODE_DIST_VERSION}/${archive}"

    echo "[Node] Node.js не найден или устарел — скачиваю portable v${NODE_DIST_VERSION} (${os}-${arch})..."
    echo "[Node] $url"

    mkdir -p "$ROOT/.runtime"
    rm -rf "$RUNTIME_DIR"
    tmp="$(mktemp -d "${TMPDIR:-/tmp}/nm-node.XXXXXX")"
    archive_path="$tmp/$archive"
    extract_dir="$tmp/extract"
    mkdir -p "$extract_dir"

    cleanup_tmp() { rm -rf "$tmp"; }
    trap cleanup_tmp EXIT

    if ! download_file "$url" "$archive_path"; then
        echo "[Ошибка] Не удалось скачать Node.js." >&2
        echo "Установите вручную: https://nodejs.org (нужен >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR})" >&2
        return 1
    fi

    if ! tar -xzf "$archive_path" -C "$extract_dir"; then
        echo "[Ошибка] Не удалось распаковать архив Node.js." >&2
        return 1
    fi

    inner="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    if [ -z "$inner" ] || [ ! -x "$inner/bin/node" ]; then
        echo "[Ошибка] В архиве нет bin/node." >&2
        return 1
    fi

    mv "$inner" "$RUNTIME_DIR"
    printf '%s' "$NODE_DIST_VERSION" > "$MARKER"
    local_ver="$(node_version_of "$RUNTIME_DIR/bin/node")"
    if ! node_ok "$local_ver"; then
        echo "[Ошибка] Скачанный Node не запускается." >&2
        return 1
    fi
    echo "[Node] Установлен локальный v${local_ver} → .runtime/node"
    trap - EXIT
    cleanup_tmp
    return 0
}

ensure_local_node() {
    local local_node local_ver want_same
    if system_node_ok; then
        echo "[Node] системный $(node -v) — OK"
        return 0
    fi

    if command -v node >/dev/null 2>&1; then
        echo "[Node] системный $(node -v 2>/dev/null || echo '?') не подходит (нужен >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}) — берём локальный runtime."
    else
        echo "[Node] системный Node.js не найден — берём локальный runtime."
    fi

    local_node="$RUNTIME_DIR/bin/node"
    if [ -x "$local_node" ] && [ -x "$RUNTIME_DIR/bin/npm" ]; then
        local_ver="$(node_version_of "$local_node")"
        want_same=0
        if [ -f "$MARKER" ] && [ "$(tr -d '\r\n' < "$MARKER")" = "$NODE_DIST_VERSION" ]; then
            want_same=1
        fi
        if node_ok "$local_ver" && [ "$want_same" -eq 1 ]; then
            echo "[Node] локальный v${local_ver} (.runtime/node) — OK"
            export PATH="$RUNTIME_DIR/bin:$PATH"
            return 0
        fi
    fi

    install_local_node || return 1
    export PATH="$RUNTIME_DIR/bin:$PATH"
    return 0
}

if ! ensure_local_node; then
    exit 1
fi

if ! system_node_ok && [ -x "$RUNTIME_DIR/bin/node" ]; then
    export PATH="$RUNTIME_DIR/bin:$PATH"
    echo "[Node] используется локальный runtime: .runtime/node"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "[Ошибка] Нужен Node.js >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR} и npm."
    echo "Установите: https://nodejs.org"
    exit 1
fi

if ! node_ok "$(node_version_of "$(command -v node)")"; then
    echo "[Ошибка] Нужен Node.js >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}, сейчас: $(node -v)"
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
