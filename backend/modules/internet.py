import asyncio
import time

import httpx

from .base import BaseModule

DEFAULT_TARGETS = [
    {"name": "Google", "url": "https://8.8.8.8"},
    {"name": "Cloudflare", "url": "https://1.1.1.1"},
    {"name": "Яндекс", "url": "https://ya.ru"},
]


class InternetModule(BaseModule):
    """Checks internet connectivity by probing a list of external targets."""

    module_id = "internet"
    interval = 30

    def __init__(self, targets: list[dict] | None = None) -> None:
        self.targets = targets if targets is not None else DEFAULT_TARGETS

    async def _probe(self, target: dict) -> dict:
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=5, verify=False) as client:
                await client.get(target["url"])
            ms = round((time.monotonic() - t0) * 1000)
            return {"name": target["name"], "ok": True, "ms": ms}
        except Exception:
            return {"name": target["name"], "ok": False, "ms": None}

    async def collect(self) -> dict:
        results: list[dict] = list(
            await asyncio.gather(*[self._probe(t) for t in self.targets])
        )
        return {
            "online": any(r["ok"] for r in results),
            "targets": results,
        }
