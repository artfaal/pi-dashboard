import httpx

from .base import BaseModule


class CO2Module(BaseModule):
    """Reads CO2 and temperature from co2mond Prometheus metrics endpoint."""

    module_id = "co2"
    interval = 30

    def __init__(self, metrics_url: str = "http://co2mond:9999/metrics") -> None:
        self.metrics_url = metrics_url

    async def collect(self) -> dict:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(self.metrics_url)
            resp.raise_for_status()
        return self._parse(resp.text)

    def _parse(self, text: str) -> dict:
        result: dict = {}
        for line in text.splitlines():
            if line.startswith("#") or not line.strip():
                continue
            # Prometheus format: <metric_name>{labels} <value> [timestamp]
            # co2mond has no labels, so: "co2mon_co2_ppm 630"
            parts = line.rsplit(" ", 1)
            if len(parts) != 2:
                continue
            name, raw_value = parts
            name = name.strip()
            try:
                value = float(raw_value)
            except ValueError:
                continue
            if name == "co2mon_co2_ppm":
                result["ppm"] = round(value)
            elif name == "co2mon_temp_celsius":
                result["temp"] = round(value, 1)
        return result
