import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from modules.co2 import CO2Module
from modules.internet import InternetModule

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
        return yaml.safe_load(f)


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


@app.get("/api/snapshot")
async def snapshot():
    """Return the last known reading from every active module."""
    return latest


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
