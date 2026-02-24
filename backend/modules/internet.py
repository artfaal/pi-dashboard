import asyncio
import logging
import os
import socket
import time

import httpx

from .base import BaseModule

logger = logging.getLogger(__name__)

DEFAULT_TARGETS = [
    {"name": "Google DNS", "url": "https://8.8.8.8"},
    {"name": "Yandex DNS", "url": "https://77.88.8.8"},
    {"name": "Яндекс",     "url": "https://ya.ru"},
]

DNS_RESOLVE_HOST = "google.com"


def _parse_env_targets() -> list[dict] | None:
    """Parse INTERNET_TARGETS env var.

    Format: "Name;https://url,Name2;https://url2"
    Returns None if the variable is not set or is empty.
    """
    raw = os.environ.get("INTERNET_TARGETS", "").strip()
    if not raw:
        return None
    result = []
    for item in raw.split(","):
        item = item.strip()
        if ";" in item:
            name, url = item.split(";", 1)
            name, url = name.strip(), url.strip()
            if name and url:
                result.append({"name": name, "url": url})
    return result or None


class InternetModule(BaseModule):
    """Checks internet connectivity by probing HTTP targets and DNS resolution."""

    module_id = "internet"
    interval = 30

    def __init__(self, targets: list[dict] | None = None) -> None:
        # INTERNET_TARGETS env var takes priority over config.yaml targets
        env_targets = _parse_env_targets()
        self.targets = env_targets or targets or DEFAULT_TARGETS
        logger.info("[internet] %d targets configured", len(self.targets))

    async def _probe(self, target: dict) -> dict:
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=5, verify=False) as client:
                await client.get(target["url"])
            ms = round((time.monotonic() - t0) * 1000)
            logger.debug("[internet] %s: ok %dms", target["name"], ms)
            return {"name": target["name"], "ok": True, "ms": ms}
        except Exception as e:
            logger.debug("[internet] %s: failed — %s", target["name"], e)
            return {"name": target["name"], "ok": False, "ms": None}

    async def _probe_dns(self) -> tuple[bool, int | None]:
        t0 = time.monotonic()
        loop = asyncio.get_event_loop()
        try:
            await loop.getaddrinfo(DNS_RESOLVE_HOST, None)
            ms = round((time.monotonic() - t0) * 1000)
            logger.debug("[internet] DNS ok %dms", ms)
            return True, ms
        except socket.gaierror as e:
            logger.warning("[internet] DNS failed: %s", e)
            return False, None

    async def collect(self) -> dict:
        probe_tasks = [self._probe(t) for t in self.targets]
        results, dns_result = await asyncio.gather(
            asyncio.gather(*probe_tasks),
            self._probe_dns(),
        )
        dns_ok, dns_ms = dns_result
        return {
            "online":  any(r["ok"] for r in results),
            "targets": list(results),
            "dns_ok":  dns_ok,
            "dns_ms":  dns_ms,
        }
