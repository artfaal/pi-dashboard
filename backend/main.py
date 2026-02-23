import asyncio
import json
import logging
import os
import subprocess
import urllib.parse
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import yaml
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from modules.co2 import CO2Module
from modules.internet import InternetModule
from modules.plants import PlantsModule
from modules.weather import WeatherModule

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("dashboard")

# ─── Module registry ──────────────────────────────────────────────────────────
# To add a new module: import its class here and add it to this dict.

MODULE_REGISTRY = {
    "co2": CO2Module,
    "internet": InternetModule,
    "plants": PlantsModule,
    "weather": WeatherModule,
}

# ─── WebSocket connection manager ─────────────────────────────────────────────


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("WS client connected. Total: %d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        try:
            self._connections.remove(ws)
        except ValueError:
            pass
        logger.info("WS client disconnected. Total: %d", len(self._connections))

    async def broadcast(self, payload: dict) -> None:
        msg = json.dumps(payload, ensure_ascii=False)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self._connections.remove(ws)
            except ValueError:
                pass


manager = ConnectionManager()

# In-memory cache of the latest reading per module
latest: dict[str, Any] = {}

# References to running module instances (for use in routes)
module_instances: dict[str, Any] = {}

# ─── Module polling loop ───────────────────────────────────────────────────────


async def module_loop(module, interval: int) -> None:
    while True:
        try:
            data = await module.collect()
            payload = {"module": module.module_id, "ok": True, "data": data}
            logger.info("[%s] collected: %s", module.module_id, data)
        except Exception as exc:
            payload = {
                "module": module.module_id,
                "ok": False,
                "data": None,
                "error": str(exc),
            }
            logger.error("[%s] collection error: %s", module.module_id, exc)

        latest[module.module_id] = payload
        await manager.broadcast(payload)
        await asyncio.sleep(interval)


# ─── App lifespan ──────────────────────────────────────────────────────────────


def _load_config() -> dict:
    path = Path(__file__).parent / "config.yaml"
    with path.open() as f:
        content = os.path.expandvars(f.read())
    return yaml.safe_load(content)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = _load_config()
    tasks: list[asyncio.Task] = []

    for mod_cfg in cfg.get("modules", []):
        if not mod_cfg.get("enabled", True):
            continue
        mod_id = mod_cfg["id"]
        cls = MODULE_REGISTRY.get(mod_id)
        if cls is None:
            logger.warning("Unknown module '%s' in config — skipping", mod_id)
            continue

        kwargs = mod_cfg.get("config", {}) or {}
        instance = cls(**kwargs)
        interval = mod_cfg.get("interval", instance.interval)
        instance.interval = interval

        module_instances[mod_id] = instance
        tasks.append(asyncio.create_task(module_loop(instance, interval)))
        logger.info("Started module '%s' (interval=%ds)", mod_id, interval)

    yield  # app running

    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    logger.info("All module tasks stopped")


# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Pi Dashboard Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "modules": list(latest.keys())}


@app.get("/api/kiosk/exit")
async def kiosk_exit():
    """Kill the Chromium kiosk process on the host."""
    subprocess.Popen(["pkill", "-x", "chromium"])
    return {"ok": True}


@app.get("/api/snapshot")
async def snapshot():
    """Return the last known reading from every active module."""
    return latest


_IMAGE_BASE_URL = os.environ.get("PLANTS_IMAGE_BASE_URL", "https://img.artfaal.ru/plants").rstrip("/")
_IMAGE_TIMEOUT  = int(os.environ.get("PLANTS_IMAGE_TIMEOUT", "10"))


@app.get("/api/plants/image/{name}")
async def plants_image(name: str):
    """Proxy plant images through SOCKS5 so the browser doesn't need direct access."""
    module = module_instances.get("plants")
    proxy = module.proxy if module else None
    url = f"{_IMAGE_BASE_URL}/{urllib.parse.quote(name)}.png"
    try:
        async with httpx.AsyncClient(timeout=_IMAGE_TIMEOUT, proxy=proxy) as client:
            r = await client.get(url)
            r.raise_for_status()
        content_type = r.headers.get("content-type", "image/png")
        return Response(content=r.content, media_type=content_type)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    # Push current state immediately so the client doesn't wait for the next cycle
    for payload in list(latest.values()):
        try:
            await ws.send_text(json.dumps(payload, ensure_ascii=False))
        except Exception:
            break
    try:
        while True:
            await ws.receive_text()  # keep alive; client messages are ignored
    except WebSocketDisconnect:
        manager.disconnect(ws)
