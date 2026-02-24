import asyncio
import base64
import json
import logging
import os
import time

from .base import BaseModule

logger = logging.getLogger(__name__)


def _parse_wan_ip(ubus_json: str) -> str:
    """Extract WAN IPv4 address from ubus call network.interface.wan status output."""
    try:
        data = json.loads(ubus_json)
        addrs = data.get("ipv4-address", [])
        if addrs:
            return addrs[0].get("address", "—")
    except Exception:
        pass
    return "—"


def _parse_uptime(proc_uptime: str) -> int:
    """Parse /proc/uptime first field → integer seconds."""
    try:
        return int(float(proc_uptime.split()[0]))
    except Exception:
        return 0


def _parse_dev_bytes(proc_net_dev: str, iface: str = "wan") -> tuple[int, int]:
    """Return (rx_bytes, tx_bytes) for the given interface from /proc/net/dev."""
    for line in proc_net_dev.splitlines():
        line = line.strip()
        if line.startswith(iface + ":"):
            parts = line.split()
            try:
                return int(parts[1]), int(parts[9])
            except (IndexError, ValueError):
                break
    return 0, 0


class RouterModule(BaseModule):
    """Collects router stats via SSH (OpenWrt / dropbear)."""

    module_id = "router"
    interval = 60

    def __init__(
        self,
        host: str = "192.168.2.1",
        user: str = "root",
    ) -> None:
        self.host = host
        self.user = user
        # SSH private key read from environment as base64 to keep .env clean
        key_b64 = os.environ.get("ROUTER_SSH_KEY_B64", "").strip()
        self._key_pem: str | None = base64.b64decode(key_b64).decode().strip() if key_b64 else None

    # ── helpers ────────────────────────────────────────────────────────────────

    async def _run(self, conn, cmd: str) -> str:
        result = await conn.run(cmd, check=False)
        return (result.stdout or "").strip()

    async def _wan_speed(self, conn) -> tuple[int, int]:
        """Returns (rx_bytes_per_sec, tx_bytes_per_sec) via 2-second sampling."""
        out1 = await self._run(conn, "cat /proc/net/dev")
        await asyncio.sleep(2)
        out2 = await self._run(conn, "cat /proc/net/dev")
        rx1, tx1 = _parse_dev_bytes(out1)
        rx2, tx2 = _parse_dev_bytes(out2)
        elapsed = 2
        return max(0, rx2 - rx1) // elapsed, max(0, tx2 - tx1) // elapsed

    # ── collect ────────────────────────────────────────────────────────────────

    async def collect(self) -> dict:
        import asyncssh  # import here so missing package gives a clear module error

        if not self._key_pem:
            raise RuntimeError("ROUTER_SSH_KEY_B64 is not set — cannot connect to router")

        key = asyncssh.import_private_key(self._key_pem)
        logger.debug("[router] connecting to %s@%s", self.user, self.host)

        async with asyncssh.connect(
            self.host,
            username=self.user,
            client_keys=[key],
            known_hosts=None,
            connect_timeout=10,
            preferred_auth=['publickey'],
        ) as conn:
            wan_json, uptime_raw, clients_raw, (rx_bps, tx_bps) = await asyncio.gather(
                self._run(conn, "ubus call network.interface.wan status 2>/dev/null"),
                self._run(conn, "cat /proc/uptime"),
                self._run(conn, "wc -l < /tmp/dhcp.leases 2>/dev/null || echo 0"),
                self._wan_speed(conn),
            )

        wan_ip     = _parse_wan_ip(wan_json)
        uptime_sec = _parse_uptime(uptime_raw)
        clients    = int(clients_raw) if clients_raw.isdigit() else 0

        logger.debug(
            "[router] wan=%s uptime=%ds clients=%d rx=%d tx=%d",
            wan_ip, uptime_sec, clients, rx_bps, tx_bps,
        )

        return {
            "wan_ip":       wan_ip,
            "uptime_secs":  uptime_sec,
            "dhcp_clients": clients,
            "wan_rx_bps":   rx_bps,
            "wan_tx_bps":   tx_bps,
        }
