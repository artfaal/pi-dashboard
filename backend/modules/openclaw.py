import base64
import logging
import os
from datetime import datetime, timedelta, timezone

import asyncssh

from .base import BaseModule

logger = logging.getLogger(__name__)

_SYSTEMD_ENV = (
    "XDG_RUNTIME_DIR=/run/user/1000 "
    "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus"
)
_SERVICE = "openclaw-gateway.service"


def _parse_props(output: str) -> dict[str, str]:
    props: dict[str, str] = {}
    for line in output.strip().splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            props[k.strip()] = v.strip()
    return props


_TZ_OFFSETS: dict[str, int] = {
    "UTC": 0, "GMT": 0,
    "MSK": 3, "MSD": 4,       # Moscow Standard / Daylight
    "EET": 2, "EEST": 3,      # Eastern Europe
    "CET": 1, "CEST": 2,      # Central Europe
    "YEKT": 5, "OMST": 6, "KRAT": 7, "IRKT": 8, "YAKT": 9,
}


def _parse_uptime(timestamp_str: str) -> int | None:
    """Парсит ActiveEnterTimestamp → секунды аптайма.

    Формат systemd: "Fri 2026-02-27 17:37:16 MSK"
    Важно учитывать часовой пояс — MSK = UTC+3.
    """
    if not timestamp_str or timestamp_str == "n/a":
        return None
    parts = timestamp_str.split()
    # Ожидаем: weekday date time tz  (минимум 3 токена с датой и временем)
    if len(parts) < 3:
        return None
    try:
        tz_name = parts[3] if len(parts) >= 4 else "UTC"
        offset_h = _TZ_OFFSETS.get(tz_name, 0)
        tz = timezone(timedelta(hours=offset_h))
        dt = datetime.strptime(f"{parts[1]} {parts[2]}", "%Y-%m-%d %H:%M:%S")
        dt = dt.replace(tzinfo=tz)
        delta = datetime.now(timezone.utc) - dt
        return max(0, int(delta.total_seconds()))
    except Exception:
        return None


class OpenclawModule(BaseModule):
    """Состояние сервиса openclaw-gateway на пи-сервере."""

    module_id = "openclaw"
    interval   = 15

    def __init__(
        self,
        host: str = "192.168.2.187",
        user: str = "claw",
    ) -> None:
        self.host = host
        self.user = user

        key_b64 = os.environ.get("OPENCLAW_SSH_KEY_B64", "").strip()
        self._key_pem: str | None = (
            base64.b64decode(key_b64).decode().strip() if key_b64 else None
        )

    def _make_conn_kwargs(self) -> dict:
        kwargs: dict = dict(
            host=self.host,
            username=self.user,
            known_hosts=None,
            connect_timeout=8,
            preferred_auth=["publickey"],
        )
        if self._key_pem:
            kwargs["client_keys"] = [asyncssh.import_private_key(self._key_pem)]
        return kwargs

    async def collect(self) -> dict:
        if not self._key_pem:
            raise RuntimeError("OPENCLAW_SSH_KEY_B64 не задан")

        cmd = (
            f"{_SYSTEMD_ENV} systemctl --user show {_SERVICE} "
            "--property=ActiveState,SubState,ActiveEnterTimestamp,"
            "MainPID,CPUUsageNSec,Description"
        )

        async with asyncssh.connect(**self._make_conn_kwargs()) as conn:
            result = await conn.run(cmd, check=False)

        props = _parse_props(result.stdout)

        active_state = props.get("ActiveState", "unknown")
        sub_state    = props.get("SubState", "")
        pid          = int(props.get("MainPID", "0") or 0)
        cpu_ns       = int(props.get("CPUUsageNSec", "0") or 0)
        description  = props.get("Description", "")
        timestamp    = props.get("ActiveEnterTimestamp", "")

        # Версия из Description: "OpenClaw Gateway (v2026.2.25)" → "2026.2.25"
        version: str | None = None
        if "(v" in description:
            try:
                version = description.split("(v")[1].rstrip(")")
            except Exception:
                pass

        uptime_secs = _parse_uptime(timestamp) if active_state == "active" else None
        cpu_mins    = round(cpu_ns / 1e9 / 60, 1) if cpu_ns else 0.0

        logger.debug(
            "[openclaw] state=%s sub=%s pid=%d uptime=%s",
            active_state, sub_state, pid, uptime_secs,
        )

        return {
            "active":       active_state == "active",
            "state":        active_state,   # active | inactive | failed | activating
            "substate":     sub_state,      # running | dead | failed | start
            "uptime_secs":  uptime_secs,
            "pid":          pid if pid else None,
            "cpu_mins":     cpu_mins,
            "version":      version,
        }
