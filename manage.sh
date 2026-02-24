#!/usr/bin/env bash
# manage.sh — управление Pi Dashboard (деплой, запуск, остановка, логи)
# Запускать с локальной машины из папки проекта.
# Читает PI_HOST, PI_USER, PI_PATH из .env

set -euo pipefail

# Загружаем .env если есть (set -a автоматически экспортирует все переменные)
if [ -f "$(dirname "$0")/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$(dirname "$0")/.env"
  set +a
fi

PI_HOST="${PI_HOST:-192.168.2.215}"
PI_USER="${PI_USER:-artfaal}"
PI_PATH="${PI_PATH:-/home/artfaal/pi-dashboard}"
PI="${PI_USER}@${PI_HOST}"

CMD="${1:-help}"

_ssh() { ssh "$PI" "$@"; }

# Полное окружение для запуска Chromium из SSH (без него labwc не активирует окно)
KIOSK_ENV="WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus"

_kiosk_start() {
  _ssh "pkill -x chromium || true; sleep 2; ${KIOSK_ENV} nohup bash ${PI_PATH}/start-kiosk.sh >>/tmp/kiosk.log 2>&1 &"
}

_sync() {
  echo "→ Syncing to ${PI}:${PI_PATH} ..."
  rsync -av \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='frontend/dist' \
    "$(dirname "$0")/" "${PI}:${PI_PATH}/"
  # Всегда перезаписываем .env (--ignore-times гарантирует push даже если Pi-версия новее)
  echo "→ Pushing .env ..."
  rsync -av --ignore-times \
    "$(dirname "$0")/.env" "${PI}:${PI_PATH}/.env"
}

case "$CMD" in

  deploy)
    # Полный деплой: sync → rebuild → restart → kiosk
    _sync
    echo "→ Building and restarting containers ..."
    _ssh "cd ${PI_PATH} && docker compose up -d --build"
    echo "→ Restarting kiosk ..."
    _kiosk_start
    echo "✓ Deploy complete — http://${PI_HOST}:${FRONTEND_PORT:-3000}"
    ;;

  sync)
    # Только синхронизация файлов (без rebuild)
    _sync
    echo "✓ Sync complete"
    ;;

  restart)
    # Перезапустить контейнеры без пересборки (подходит при смене .env)
    echo "→ Restarting containers ..."
    _ssh "cd ${PI_PATH} && docker compose restart"
    echo "✓ Restarted"
    ;;

  stop)
    echo "→ Stopping containers ..."
    _ssh "cd ${PI_PATH} && docker compose down"
    echo "✓ Stopped"
    ;;

  start)
    echo "→ Starting containers ..."
    _ssh "cd ${PI_PATH} && docker compose up -d"
    echo "✓ Started"
    ;;

  logs)
    SERVICE="${2:-}"
    _ssh "cd ${PI_PATH} && docker compose logs -f ${SERVICE}"
    ;;

  status)
    _ssh "cd ${PI_PATH} && docker compose ps"
    ;;

  kiosk)
    # Перезапустить Chromium kiosk на Pi
    echo "→ Restarting kiosk on ${PI} ..."
    _kiosk_start
    echo "✓ Kiosk restarting (log: /tmp/kiosk.log on Pi)"
    ;;

  kiosk-stop)
    # Закрыть Chromium kiosk на Pi
    echo "→ Stopping kiosk on ${PI} ..."
    _ssh "pkill -x chromium || true"
    echo "✓ Kiosk stopped"
    ;;

  *)
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  deploy          sync + rebuild + restart (полный деплой)"
    echo "  sync            только синхронизировать файлы"
    echo "  restart         перезапустить контейнеры (без rebuild)"
    echo "  stop            остановить контейнеры"
    echo "  start           запустить контейнеры"
    echo "  logs [service]  следить за логами (backend/frontend)"
    echo "  status          статус контейнеров"
    echo "  kiosk           перезапустить Chromium на Pi"
  echo "  kiosk-stop      закрыть Chromium kiosk на Pi"
    ;;

esac
