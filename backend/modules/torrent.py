import asyncio
import base64
import logging
import os
from datetime import datetime

from .base import BaseModule

logger = logging.getLogger(__name__)

# Диски на southnet.local: (название в UI, mount point)
_DISK_MOUNTS = [
    ("Main",  "/"),
    ("NVME",  "/Volumes/stuff"),
    ("HDD",   "/Volumes/COLD"),
]

# Маппинг статусов Transmission → единый статус
_STATUS_MAP = {
    "stopped":         "paused",
    "check pending":   "checking",
    "checking":        "checking",
    "download pending":"downloading",
    "downloading":     "downloading",
    "seed pending":    "seeding",
    "seeding":         "seeding",
}


def _parse_df(output: str) -> list[dict]:
    """Разобрать вывод df -k, пропустив заголовок."""
    disks = []
    lines = output.strip().split("\n")
    data_lines = [l for l in lines if l and not l.startswith("Filesystem")]
    for (name, mount), line in zip(_DISK_MOUNTS, data_lines):
        parts = line.split()
        if len(parts) < 4:
            continue
        try:
            total_kb = int(parts[1])
            avail_kb = int(parts[3])
            used_pct = int(parts[4].rstrip("%"))
        except (ValueError, IndexError):
            continue
        disks.append({
            "name":     name,
            "mount":    mount,
            "total_gb": round(total_kb / 1024 / 1024, 1),
            "free_gb":  round(avail_kb / 1024 / 1024, 1),
            "used_pct": used_pct,
        })
    return disks


def _torrent_to_dict(t) -> dict:
    """Конвертировать объект Torrent в dict для WebSocket."""
    status_raw = getattr(t, "status", "stopped")
    if hasattr(status_raw, "value"):
        status_raw = status_raw.value
    status = _STATUS_MAP.get(str(status_raw), "unknown")

    # Если есть ошибка — переопределяем статус
    if getattr(t, "error_string", None):
        status = "error"

    # ETA: timedelta или None
    eta_secs = None
    eta_obj = getattr(t, "eta", None)
    if eta_obj is not None:
        try:
            secs = int(eta_obj.total_seconds())
            if secs > 0:
                eta_secs = secs
        except Exception:
            pass

    # Дата добавления в клиент (added_date — datetime или None)
    added = getattr(t, "added_date", None)
    added_iso = added.isoformat() if isinstance(added, datetime) else None

    return {
        "id":                  getattr(t, "id", 0),
        "name":                getattr(t, "name", ""),
        "status":              status,
        "progress":            round(float(getattr(t, "progress", 0.0)), 1),
        "size_bytes":          int(getattr(t, "total_size", 0) or 0),
        "download_speed_bps":  int(getattr(t, "rate_download", 0) or 0),
        "upload_speed_bps":    int(getattr(t, "rate_upload", 0) or 0),
        "eta_secs":            eta_secs,
        "added_date":          added_iso,
        "peers":               int(getattr(t, "peers_connected", 0) or 0),
    }


class TorrentModule(BaseModule):
    """Статистика торрентов (Transmission RPC) + свободное место на southnet."""

    module_id = "torrent"
    interval   = 30

    def __init__(
        self,
        transmission_host: str = "192.168.2.100",
        transmission_port: int = 9091,
        transmission_user: str = "admin",
        transmission_pass: str = "",
        ssh_host:          str = "southnet.local",
        ssh_user:          str = "southnet-mac-server",
        max_recent:        int = 10,
    ) -> None:
        self.tr_host   = transmission_host
        self.tr_port   = transmission_port
        self.tr_user   = transmission_user
        self.tr_pass   = transmission_pass
        self.ssh_host  = ssh_host
        self.ssh_user  = ssh_user
        self.max_recent = max_recent

        # Ключ — тот же что и для роутера, хранится как base64 в env
        key_b64 = os.environ.get("ROUTER_SSH_KEY_B64", "").strip()
        self._key_pem: str | None = (
            base64.b64decode(key_b64).decode().strip() if key_b64 else None
        )

    # ── Transmission ───────────────────────────────────────────────────────

    async def _fetch_transmission(self) -> tuple[list, object]:
        import transmission_rpc  # lazy import

        loop = asyncio.get_event_loop()

        def _sync():
            client = transmission_rpc.Client(
                host=self.tr_host,
                port=self.tr_port,
                username=self.tr_user,
                password=self.tr_pass,
                timeout=10,
            )
            return client.get_torrents(), client.session_stats()

        return await loop.run_in_executor(None, _sync)

    # ── Disk info via SSH ──────────────────────────────────────────────────

    async def _fetch_disks(self) -> list[dict]:
        import asyncssh  # lazy import

        if not self._key_pem:
            logger.warning("[torrent] ROUTER_SSH_KEY_B64 не задан, пропускаю диски")
            return []

        mounts = " ".join(m for _, m in _DISK_MOUNTS)
        key = asyncssh.import_private_key(self._key_pem)

        async with asyncssh.connect(
            self.ssh_host,
            username=self.ssh_user,
            client_keys=[key],
            known_hosts=None,
            connect_timeout=10,
            preferred_auth=["publickey"],
        ) as conn:
            result = await conn.run(f"df -k {mounts}", check=True)

        return _parse_df(result.stdout)

    # ── collect ────────────────────────────────────────────────────────────

    async def collect(self) -> dict:
        torrents_task = asyncio.create_task(self._fetch_transmission())
        disks_task    = asyncio.create_task(self._fetch_disks())

        # Запускаем параллельно; SSH-диски не должны валить всю коллекцию
        (torrent_result, disk_result) = await asyncio.gather(
            torrents_task, disks_task, return_exceptions=True
        )

        if isinstance(torrent_result, Exception):
            raise torrent_result  # Transmission критичен — пробрасываем

        raw_torrents, stats = torrent_result

        if isinstance(disk_result, Exception):
            logger.warning("[torrent] disk SSH failed: %s", disk_result)
            disks = []
        else:
            disks = disk_result

        all_torrents = [_torrent_to_dict(t) for t in raw_torrents]

        # Сортировка по дате добавления — новые сначала
        all_torrents.sort(
            key=lambda t: t["added_date"] or "",
            reverse=True,
        )

        # Активная загрузка (первый downloading)
        active = next(
            (t for t in all_torrents if t["status"] == "downloading"), None
        )

        logger.debug(
            "[torrent] torrents=%d active=%s dl=%.1fKB/s disks=%d",
            len(all_torrents),
            active["name"][:30] if active else "—",
            stats.download_speed / 1024,
            len(disks),
        )

        return {
            "downloading": active,
            "recent":      all_torrents[: self.max_recent],
            "speed": {
                "download_bps": stats.download_speed,
                "upload_bps":   stats.upload_speed,
            },
            "disks": disks,
        }
