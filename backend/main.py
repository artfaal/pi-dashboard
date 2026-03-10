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
from modules.openclaw import OpenclawModule
from modules.plants import PlantsModule
from modules.plex import PlexModule
from modules.router import RouterModule
from modules.torrent import TorrentModule
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
    "co2":       CO2Module,
    "internet":  InternetModule,
    "openclaw":  OpenclawModule,
    "plants":    PlantsModule,
    "plex":      PlexModule,
    "router":    RouterModule,
    "torrent":   TorrentModule,
    "weather":   WeatherModule,
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


_OPENCLAW_HOST = os.environ.get("OPENCLAW_HOST", "192.168.2.187")
_OPENCLAW_USER = os.environ.get("OPENCLAW_USER", "claw")
_OPENCLAW_SYSTEMD_ENV = (
    "XDG_RUNTIME_DIR=/run/user/1000 "
    "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus"
)
_OPENCLAW_SERVICE = "openclaw-gateway.service"


@app.post("/api/openclaw/{action}")
async def openclaw_action(action: str):
    """Run start / stop / restart on the openclaw-gateway service via SSH."""
    if action not in ("start", "stop", "restart"):
        raise HTTPException(status_code=400, detail="action must be start|stop|restart")

    import base64 as _b64
    import asyncssh

    key_b64 = os.environ.get("OPENCLAW_SSH_KEY_B64", "").strip()
    if not key_b64:
        raise HTTPException(status_code=503, detail="OPENCLAW_SSH_KEY_B64 not configured")

    key = asyncssh.import_private_key(_b64.b64decode(key_b64).decode().strip())
    cmd = (
        f"{_OPENCLAW_SYSTEMD_ENV} "
        f"systemctl --user {action} {_OPENCLAW_SERVICE}"
    )
    try:
        async with asyncssh.connect(
            _OPENCLAW_HOST,
            username=_OPENCLAW_USER,
            client_keys=[key],
            known_hosts=None,
            connect_timeout=8,
            preferred_auth=["publickey"],
        ) as conn:
            result = await conn.run(cmd, check=False)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    logger.info("[openclaw] action=%s rc=%d", action, result.exit_status)
    return {"ok": result.exit_status == 0, "action": action}


_PLEX_HOST  = os.environ.get("PLEX_HOST", "192.168.2.169")
_PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "")
_PLEX_THUMB_CACHE_DIR = Path("/cache/plex_thumbs")
_PLEX_THUMB_CACHE_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/plex/thumb")
async def plex_thumb(path: str, w: int = 300, h: int = 450):
    """Proxy and cache Plex poster thumbnails."""
    import hashlib
    cache_key = hashlib.sha256(f"{path}{w}{h}".encode()).hexdigest()
    cache_file = _PLEX_THUMB_CACHE_DIR / f"{cache_key}.jpg"

    if cache_file.exists():
        return Response(content=cache_file.read_bytes(), media_type="image/jpeg")

    url = f"http://{_PLEX_HOST}:32400{path}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, params={"X-Plex-Token": _PLEX_TOKEN, "width": w, "height": h})
            r.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    content_type = r.headers.get("content-type", "image/jpeg")
    cache_file.write_bytes(r.content)
    return Response(content=r.content, media_type=content_type)


_IMAGE_BASE_URL = os.environ.get("PLANTS_IMAGE_BASE_URL", "https://img.artfaal.ru/plants").rstrip("/")
_IMAGE_TIMEOUT  = int(os.environ.get("PLANTS_IMAGE_TIMEOUT", "10"))
_IMAGE_CACHE_DIR = Path("/cache/plant_images")
_IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/plants/image/{name}")
async def plants_image(name: str):
    """Proxy plant images with disk cache inside the container."""
    safe_name = urllib.parse.quote(name, safe="")
    cache_file = _IMAGE_CACHE_DIR / f"{safe_name}.png"

    if cache_file.exists():
        return Response(content=cache_file.read_bytes(), media_type="image/png")

    url = f"{_IMAGE_BASE_URL}/{urllib.parse.quote(name)}.png"
    try:
        async with httpx.AsyncClient(timeout=_IMAGE_TIMEOUT) as client:
            r = await client.get(url)
            r.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    content_type = r.headers.get("content-type", "image/png")
    cache_file.write_bytes(r.content)
    logger.info("[plants] cached image: %s", name)
    return Response(content=r.content, media_type=content_type)


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
