import asyncio
import logging
import ssl
import time

import httpx

from .base import BaseModule

logger = logging.getLogger(__name__)

# URL that always responds and returns the exit IP in JSON
_TEST_URL = "http://ip-api.com/json?fields=query,isp"
_TIMEOUT  = 10.0


class ProxyModule(BaseModule):
    """Tests proxy servers reachability and routes traffic through them."""

    module_id = "proxy"
    interval  = 120  # 2 minutes — tests are slow

    def __init__(
        self,
        vega_host: str = "vega.artfaal.ru",
        vega_pass: str = "",
        vega_user: str = "artfaal",
    ) -> None:
        self.vega_host = vega_host
        self.vega_user = vega_user
        self.vega_pass = vega_pass

    # ── individual testers ────────────────────────────────────────────────────

    async def _test_proxy(self, name: str, proto: str, proxy_url: str) -> dict:
        """Test an HTTP/SOCKS proxy by fetching ip-api.com through it."""
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(
                proxy=proxy_url,
                timeout=_TIMEOUT,
                verify=False,
            ) as client:
                r = await client.get(_TEST_URL)
                data = r.json()
                ms = round((time.monotonic() - t0) * 1000)
                exit_ip  = data.get("query", "?")
                exit_isp = data.get("isp", "")
                logger.debug("[proxy] %s ok %dms exit=%s", name, ms, exit_ip)
                return {
                    "name": name, "type": proto,
                    "ok": True, "ms": ms,
                    "exit_ip": exit_ip, "exit_isp": exit_isp,
                }
        except Exception as e:
            ms = round((time.monotonic() - t0) * 1000)
            logger.warning("[proxy] %s failed (%dms): %s", name, ms, e)
            return {"name": name, "type": proto, "ok": False, "ms": ms, "error": str(e)[:80]}

    async def _test_tcp(self, name: str, host: str, port: int) -> dict:
        """Test raw TCP reachability (for Shadowsocks — no client library)."""
        t0 = time.monotonic()
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout=5
            )
            writer.close()
            await asyncio.wait_for(writer.wait_closed(), timeout=2)
            ms = round((time.monotonic() - t0) * 1000)
            logger.debug("[proxy] %s TCP ok %dms", name, ms)
            return {"name": name, "type": "ss", "ok": True, "ms": ms}
        except Exception as e:
            ms = round((time.monotonic() - t0) * 1000)
            logger.warning("[proxy] %s TCP failed: %s", name, e)
            return {"name": name, "type": "ss", "ok": False, "ms": ms, "error": str(e)[:80]}

    async def _test_tls(self, name: str, host: str, port: int) -> dict:
        """Test TLS handshake reachability (for Trojan — verifies TLS layer only)."""
        t0 = time.monotonic()
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode    = ssl.CERT_NONE
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port, ssl=ctx), timeout=5
            )
            writer.close()
            await asyncio.wait_for(writer.wait_closed(), timeout=2)
            ms = round((time.monotonic() - t0) * 1000)
            logger.debug("[proxy] %s TLS ok %dms", name, ms)
            return {"name": name, "type": "trojan", "ok": True, "ms": ms}
        except Exception as e:
            ms = round((time.monotonic() - t0) * 1000)
            logger.warning("[proxy] %s TLS failed: %s", name, e)
            return {"name": name, "type": "trojan", "ok": False, "ms": ms, "error": str(e)[:80]}

    # ── collect ────────────────────────────────────────────────────────────────

    async def collect(self) -> dict:
        u, p = self.vega_user, self.vega_pass
        vh    = self.vega_host

        tests = [
            # direct SOCKS5 on vega
            self._test_proxy(
                "SOCKS5", "socks5",
                f"socks5://{u}:{p}@{vh}:1080",
            ),
            # HTTP CONNECT on vega
            self._test_proxy(
                "HTTP", "http",
                f"http://{u}:{p}@{vh}:3128",
            ),
            # HTTPS CONNECT on vega (TLS tunnel to proxy)
            self._test_proxy(
                "HTTPS", "https",
                f"https://{u}:{p}@{vh}:443",
            ),
            # Shadowsocks — TCP reachability only (no SS client in Python)
            self._test_tcp("Shadowsocks", vh, 8388),
            # Trojan — TLS layer check
            self._test_tls("Trojan", vh, 8443),
        ]

        results = list(await asyncio.gather(*tests))

        # "ok" = at least one full-proxy test (not just TCP/TLS) succeeded
        ok = any(
            r["ok"] and r.get("type") in ("socks5", "http", "https")
            for r in results
        )
        logger.info(
            "[proxy] done: %d/%d ok",
            sum(1 for r in results if r["ok"]),
            len(results),
        )
        return {"ok": ok, "proxies": results}
