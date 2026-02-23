import urllib.parse

import httpx

from .base import BaseModule

IMAGE_PROXY = "/api/plants/image"


class PlantsModule(BaseModule):
    module_id = "plants"
    interval = 300

    def __init__(
        self,
        pushgateway_url: str = "https://pushgateway.artfaal.ru",
        proxy_host: str = "",
        proxy_port: int = 1080,
        proxy_user: str = "",
        proxy_password: str = "",
    ) -> None:
        self.pushgateway_url = pushgateway_url.rstrip("/")
        if proxy_host:
            creds = f"{proxy_user}:{proxy_password}@" if proxy_user else ""
            self.proxy = f"socks5://{creds}{proxy_host}:{proxy_port}"
        else:
            self.proxy = None

    async def collect(self) -> dict:
        async with httpx.AsyncClient(timeout=15, proxy=self.proxy) as client:
            r = await client.get(f"{self.pushgateway_url}/api/v1/metrics")
            r.raise_for_status()
        data = r.json()

        FIELD_MAP = {
            "tuya_plant_humidity": "humidity",
            "tuya_plant_temperature": "temp",
            "tuya_plant_battery": "battery",
            "tuya_plant_humidity_threshold_min": "humidity_min",
            "tuya_plant_humidity_threshold_max": "humidity_max",
        }
        plants: dict[str, dict] = {}
        for group_entry in data.get("data", []):
            for metric_name, metric_data in group_entry.items():
                if metric_name not in FIELD_MAP or not isinstance(metric_data, dict):
                    continue
                for m in metric_data.get("metrics", []):
                    name = m["labels"].get("device_name")
                    if not name:
                        continue
                    if name not in plants:
                        plants[name] = {
                            "name": name,
                            "group": m["labels"].get("group", "unknown"),
                            "image_url": f"{IMAGE_PROXY}/{urllib.parse.quote(name)}",
                        }
                    plants[name][FIELD_MAP[metric_name]] = float(m["value"])

        GROUP_ORDER = {"alpha": 0, "bravo": 1}
        sorted_plants = sorted(
            plants.values(),
            key=lambda p: (GROUP_ORDER.get(p.get("group", ""), 99), p["name"]),
        )
        return {"plants": sorted_plants, "count": len(sorted_plants)}
