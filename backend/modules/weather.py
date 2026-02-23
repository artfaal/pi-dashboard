import httpx

from .base import BaseModule

# WMO weather interpretation codes → (condition, Russian description)
_WMO: dict[int, tuple[str, str]] = {
    0:  ("clear",  "Ясно"),
    1:  ("clear",  "Преимущественно ясно"),
    2:  ("cloudy", "Переменная облачность"),
    3:  ("cloudy", "Пасмурно"),
    45: ("fog",    "Туман"),
    48: ("fog",    "Изморозь"),
    51: ("rain",   "Слабая морось"),
    53: ("rain",   "Морось"),
    55: ("rain",   "Сильная морось"),
    56: ("rain",   "Замерзающая морось"),
    57: ("rain",   "Сильная замерзающая морось"),
    61: ("rain",   "Небольшой дождь"),
    63: ("rain",   "Дождь"),
    65: ("rain",   "Сильный дождь"),
    66: ("rain",   "Ледяной дождь"),
    67: ("rain",   "Сильный ледяной дождь"),
    71: ("snow",   "Небольшой снег"),
    73: ("snow",   "Снег"),
    75: ("snow",   "Сильный снег"),
    77: ("snow",   "Снежная крупа"),
    80: ("rain",   "Ливень"),
    81: ("rain",   "Ливень"),
    82: ("rain",   "Сильный ливень"),
    85: ("snow",   "Снежный ливень"),
    86: ("snow",   "Сильный снежный ливень"),
    95: ("storm",  "Гроза"),
    96: ("storm",  "Гроза с градом"),
    99: ("storm",  "Гроза с сильным градом"),
}

_DIRECTIONS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"]


def _wind_dir(degrees: float) -> str:
    idx = round(degrees / 45) % 8
    return _DIRECTIONS[idx]


def _wmo(code: int) -> tuple[str, str]:
    if code in _WMO:
        return _WMO[code]
    return _WMO.get((code // 10) * 10, ("cloudy", f"Код {code}"))


class WeatherModule(BaseModule):
    """Fetches current weather from Open-Meteo (free, no API key required)."""

    module_id = "weather"
    interval = 600  # 10 minutes

    _BASE = "https://api.open-meteo.com/v1/forecast"

    def __init__(
        self,
        latitude: float = 55.7558,
        longitude: float = 37.6176,
        timezone: str = "Europe/Moscow",
        location_name: str = "Москва",
    ) -> None:
        self.latitude = latitude
        self.longitude = longitude
        self.timezone = timezone
        self.location_name = location_name

    async def collect(self) -> dict:
        params = {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "timezone": self.timezone,
            "current": ",".join([
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "wind_speed_10m",
                "wind_direction_10m",
                "precipitation",
                "weather_code",
                "is_day",
            ]),
            "daily": "temperature_2m_max,temperature_2m_min",
            "forecast_days": 1,
        }

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self._BASE, params=params)
            resp.raise_for_status()

        body = resp.json()
        cur = body["current"]
        daily = body.get("daily", {})

        code = int(cur.get("weather_code", 0))
        condition, description = _wmo(code)

        return {
            "location":      self.location_name,
            "temp":          round(cur["temperature_2m"], 1),
            "feels_like":    round(cur["apparent_temperature"], 1),
            "humidity":      int(cur["relative_humidity_2m"]),
            "wind_speed":    round(cur["wind_speed_10m"], 1),
            "wind_dir":      _wind_dir(cur.get("wind_direction_10m", 0)),
            "precipitation": round(cur.get("precipitation", 0), 1),
            "condition":     condition,
            "description":   description,
            "is_day":        bool(cur.get("is_day", 1)),
            "temp_max":      round(daily.get("temperature_2m_max", [cur["temperature_2m"]])[0], 1),
            "temp_min":      round(daily.get("temperature_2m_min", [cur["temperature_2m"]])[0], 1),
        }
