import logging
import xml.etree.ElementTree as ET

import httpx

from .base import BaseModule

logger = logging.getLogger(__name__)


class PlexModule(BaseModule):
    """Plex Media Server — сессии и последние добавленные медиа."""

    module_id = "plex"
    interval = 120

    def __init__(
        self,
        host: str = "192.168.2.169",
        token: str = "",
        recent_limit: int = 12,
    ) -> None:
        self.base_url = f"http://{host}:32400"
        self.token = token
        self.recent_limit = recent_limit

    def _headers(self) -> dict:
        return {
            "X-Plex-Token": self.token,
            "Accept": "application/xml",
        }

    # ── helpers ────────────────────────────────────────────────────────────────

    def _thumb(self, el: ET.Element, attr: str = "thumb") -> str | None:
        v = el.get(attr)
        return v if v else None

    def _rating(self, el: ET.Element) -> float | None:
        v = el.get("rating")
        try:
            return round(float(v), 1) if v else None
        except ValueError:
            return None

    def _genres(self, el: ET.Element) -> list[str]:
        return [g.get("tag") for g in el.findall("Genre") if g.get("tag")]

    # ── fetch ──────────────────────────────────────────────────────────────────

    async def _get_xml(self, client: httpx.AsyncClient, path: str, params: dict | None = None) -> ET.Element:
        url = f"{self.base_url}{path}"
        r = await client.get(url, headers=self._headers(), params=params or {}, timeout=10)
        r.raise_for_status()
        return ET.fromstring(r.content)

    async def _fetch_now_playing(self, client: httpx.AsyncClient) -> list[dict]:
        try:
            root = await self._get_xml(client, "/status/sessions")
        except Exception as exc:
            logger.warning("[plex] sessions fetch failed: %s", exc)
            return []

        sessions = []
        for v in root.findall("Video"):
            media_type = v.get("type", "movie")
            duration_ms = int(v.get("duration") or 0)
            offset_ms = int(v.get("viewOffset") or 0)
            pct = round(offset_ms / duration_ms * 100, 1) if duration_ms else 0

            # Имя девайса из вложенного <Player>
            player_el = v.find("Player")
            player = player_el.get("title", "") if player_el is not None else ""

            entry: dict = {
                "title": v.get("title", ""),
                "type": media_type,
                "thumb": self._thumb(v),
                "progress_pct": pct,
                "duration_ms": duration_ms,
                "view_offset_ms": offset_ms,
                "player": player,
            }
            if media_type == "episode":
                entry["show"] = v.get("grandparentTitle", "")
                entry["season"] = int(v.get("parentIndex") or 0) or None
                entry["episode"] = int(v.get("index") or 0) or None

            sessions.append(entry)

        return sessions

    async def _fetch_recent_movies(self, client: httpx.AsyncClient) -> list[dict]:
        try:
            root = await self._get_xml(
                client,
                "/library/sections/1/recentlyAdded",
                {"limit": self.recent_limit},
            )
        except Exception as exc:
            logger.warning("[plex] recent movies fetch failed: %s", exc)
            return []

        movies = []
        for v in root.findall("Video"):
            movies.append({
                "title": v.get("title", ""),
                "year": int(v.get("year")) if v.get("year") else None,
                "rating": self._rating(v),
                "genres": self._genres(v),
                "thumb": self._thumb(v),
                "added_at": int(v.get("addedAt") or 0),
            })
        return movies

    async def _fetch_recent_shows(self, client: httpx.AsyncClient) -> list[dict]:
        try:
            root = await self._get_xml(
                client,
                "/library/sections/2/recentlyAdded",
                {"limit": self.recent_limit * 3},  # запасной margin для дедупликации
            )
        except Exception as exc:
            logger.warning("[plex] recent shows fetch failed: %s", exc)
            return []

        seen: set[str] = set()
        shows = []
        for v in root.findall("Video"):
            show_title = v.get("grandparentTitle", "")
            if not show_title or show_title in seen:
                continue
            seen.add(show_title)
            shows.append({
                "title": show_title,
                "year": int(v.get("parentYear")) if v.get("parentYear") else None,
                "thumb": self._thumb(v, "grandparentThumb"),
                "season": int(v.get("parentIndex") or 0) or None,
                "added_at": int(v.get("addedAt") or 0),
            })
            if len(shows) >= self.recent_limit:
                break

        return shows

    # ── collect ────────────────────────────────────────────────────────────────

    async def collect(self) -> dict:
        import asyncio

        async with httpx.AsyncClient() as client:
            now_playing, recent_movies, recent_shows = await asyncio.gather(
                self._fetch_now_playing(client),
                self._fetch_recent_movies(client),
                self._fetch_recent_shows(client),
            )

        logger.debug(
            "[plex] playing=%d movies=%d shows=%d",
            len(now_playing), len(recent_movies), len(recent_shows),
        )

        return {
            "now_playing": now_playing,
            "recent_movies": recent_movies,
            "recent_shows": recent_shows,
        }
