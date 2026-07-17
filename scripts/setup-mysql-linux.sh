#!/usr/bin/env bash
# Install MySQL (if needed), create DB/user, point server-config at MySQL,
# migrate data/store.json → MySQL, set storage=mysql.
#
# Usage (from repo root, with sudo for package install):
#   sudo bash scripts/setup-mysql-linux.sh
#   sudo MYSQL_PASSWORD='secret' bash scripts/setup-mysql-linux.sh
#
# Env (optional):
#   MYSQL_HOST=127.0.0.1
#   MYSQL_PORT=3306
#   MYSQL_USER=networkmap
#   MYSQL_PASSWORD=...          # generated if empty
#   MYSQL_DATABASE=network_map
#   SKIP_APT=1                  # do not apt/dnf install
#   SKIP_MIGRATE=1              # only install + config

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-networkmap}"
MYSQL_DATABASE="${MYSQL_DATABASE:-network_map}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
SKIP_APT="${SKIP_APT:-0}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[setup-mysql] Нужен root (sudo). Пример: sudo bash scripts/setup-mysql-linux.sh"
  exit 1
fi

# Real user who invoked sudo (for later npm as non-root if possible)
RUN_AS="${SUDO_USER:-root}"

log() { echo "[setup-mysql] $*"; }

ensure_password() {
  if [[ -z "$MYSQL_PASSWORD" ]]; then
    if command -v openssl >/dev/null 2>&1; then
      MYSQL_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
    else
      MYSQL_PASSWORD="nm$(date +%s | tail -c 8)"
    fi
    log "Сгенерирован MYSQL_PASSWORD (сохраните): $MYSQL_PASSWORD"
  fi
}

mysql_service_active() {
  systemctl is-active --quiet mysql 2>/dev/null ||
    systemctl is-active --quiet mysqld 2>/dev/null ||
    systemctl is-active --quiet mariadb 2>/dev/null
}

start_mysql_service() {
  systemctl enable --now mariadb 2>/dev/null ||
    systemctl enable --now mysql 2>/dev/null ||
    systemctl enable --now mysqld 2>/dev/null ||
    true
}

# apt: real installable Candidate (not just a dependency mention)
apt_pkg_available() {
  local pkg="$1"
  local cand
  cand="$(apt-cache policy "$pkg" 2>/dev/null | awk '/^[[:space:]]*Candidate:/ { print $2; exit }')"
  [[ -n "$cand" && "$cand" != "(none)" ]]
}

install_apt_db_server() {
  # Debian Bookworm: mysql-server often has no Candidate; use MariaDB meta/package.
  local pkg
  for pkg in mariadb-server default-mysql-server mysql-server; do
    if apt_pkg_available "$pkg"; then
      log "Установка $pkg через apt…"
      apt-get install -y "$pkg"
      return 0
    fi
  done
  echo "[setup-mysql] Нет пакетов mariadb-server / default-mysql-server / mysql-server в apt."
  echo "[setup-mysql] Установите MariaDB вручную: sudo apt-get install -y mariadb-server"
  return 1
}

install_mysql() {
  if command -v mysqld >/dev/null 2>&1 || command -v mariadbd >/dev/null 2>&1 || command -v mysql >/dev/null 2>&1; then
    if mysql_service_active; then
      log "MySQL/MariaDB уже установлен и запущен"
      return 0
    fi
    log "Сервер установлен, но не запущен — пробую стартовать…"
    start_mysql_service
    if mysql_service_active; then
      log "MySQL/MariaDB запущен"
      return 0
    fi
  fi

  if [[ "$SKIP_APT" == "1" ]]; then
    log "SKIP_APT=1 — установка пакетов пропущена"
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    install_apt_db_server
    start_mysql_service
  elif command -v dnf >/dev/null 2>&1; then
    if dnf list available mysql-server >/dev/null 2>&1; then
      log "Установка mysql-server через dnf…"
      dnf install -y mysql-server
    else
      log "Установка mariadb-server через dnf…"
      dnf install -y mariadb-server
    fi
    start_mysql_service
  elif command -v yum >/dev/null 2>&1; then
    if yum list available mysql-server >/dev/null 2>&1; then
      log "Установка mysql-server через yum…"
      yum install -y mysql-server
    else
      log "Установка mariadb-server через yum…"
      yum install -y mariadb-server
    fi
    start_mysql_service
  else
    echo "[setup-mysql] Не найден apt/dnf/yum. Установите MySQL/MariaDB вручную и повторите с SKIP_APT=1"
    exit 1
  fi
}

wait_mysql() {
  local i
  for i in $(seq 1 30); do
    if mysqladmin ping -h127.0.0.1 --silent 2>/dev/null; then
      return 0
    fi
    # root socket auth
    if mysql -uroot -e "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "[setup-mysql] MySQL не отвечает"
  exit 1
}

mysql_root() {
  # Debian/Ubuntu: root via unix_socket; else try empty password
  if mysql -uroot -e "SELECT 1" >/dev/null 2>&1; then
    mysql -uroot "$@"
  elif mysql -uroot -h127.0.0.1 -e "SELECT 1" >/dev/null 2>&1; then
    mysql -uroot -h127.0.0.1 "$@"
  else
    echo "[setup-mysql] Не удалось подключиться как root. Задайте доступ вручную."
    exit 1
  fi
}

create_db_user() {
  log "Создание БД $MYSQL_DATABASE и пользователя $MYSQL_USER…"
  mysql_root <<SQL
CREATE DATABASE IF NOT EXISTS \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'localhost' IDENTIFIED BY '$MYSQL_PASSWORD';
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'127.0.0.1' IDENTIFIED BY '$MYSQL_PASSWORD';
ALTER USER '$MYSQL_USER'@'localhost' IDENTIFIED BY '$MYSQL_PASSWORD';
ALTER USER '$MYSQL_USER'@'127.0.0.1' IDENTIFIED BY '$MYSQL_PASSWORD';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '$MYSQL_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
}

write_config() {
  if [[ ! -f server-config.json ]]; then
    if [[ -f server/config/server-config.example.json ]]; then
      cp server/config/server-config.example.json server-config.json
      log "Создан server-config.json из example"
    else
      echo "{}" > server-config.json
    fi
  fi

  MYSQL_HOST="$MYSQL_HOST" MYSQL_PORT="$MYSQL_PORT" MYSQL_USER="$MYSQL_USER" \
  MYSQL_PASSWORD="$MYSQL_PASSWORD" MYSQL_DATABASE="$MYSQL_DATABASE" \
  node scripts/configure-mysql-storage.js
}

run_migrate() {
  if [[ "$SKIP_MIGRATE" == "1" ]]; then
    log "SKIP_MIGRATE=1 — миграция пропущена"
    return 0
  fi
  if [[ ! -f data/store.json ]]; then
    log "Нет data/store.json — схема применится при первом npm run api; данные не импортированы"
    log "Скопируйте store.json на сервер и выполните: npm run migrate:mysql"
    return 0
  fi
  log "Миграция data/store.json → MySQL…"
  if [[ "$RUN_AS" != "root" ]] && id "$RUN_AS" >/dev/null 2>&1; then
    sudo -u "$RUN_AS" -H bash -lc "cd '$ROOT' && npm run migrate:mysql"
  else
    npm run migrate:mysql
  fi
}

main() {
  log "Корень проекта: $ROOT"
  ensure_password
  install_mysql
  wait_mysql
  create_db_user
  write_config
  if [[ ! -d node_modules ]]; then
    log "npm install…"
    if [[ "$RUN_AS" != "root" ]] && id "$RUN_AS" >/dev/null 2>&1; then
      sudo -u "$RUN_AS" -H bash -lc "cd '$ROOT' && npm install"
    else
      npm install
    fi
  fi
  run_migrate
  log "Готово."
  log "  storage=mysql  db=$MYSQL_DATABASE  user=$MYSQL_USER  host=$MYSQL_HOST:$MYSQL_PORT"
  log "  Запуск: npm run api"
  log "  Пароль MySQL пользователя: $MYSQL_PASSWORD"
}

main "$@"
