# Pi Dashboard

Модульный home-дашборд для **Raspberry Pi** с сенсорным дисплеем.
Работает как полноэкранное Chromium-приложение в kiosk-режиме под Wayland (labwc).

---

## Содержание

1. [Архитектура](#архитектура)
2. [Структура проекта](#структура-проекта)
3. [Технологии](#технологии)
4. [Модули бэкенда](#модули-бэкенда)
5. [Виджеты фронтенда](#виджеты-фронтенда)
6. [Конфигурация (.env)](#конфигурация-env)
7. [Управление (manage.sh)](#управление-managesh)
8. [Настройки на Pi вне контейнеров](#настройки-на-pi-вне-контейнеров)
9. [Как добавить новый модуль](#как-добавить-новый-модуль)
10. [Известные нюансы](#известные-нюансы)

---

## Архитектура

```
                    Raspberry Pi
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Docker Compose: pi-dashboard               │  │
│  │                                                      │  │
│  │   ┌─────────────────────┐   ┌────────────────────┐  │  │
│  │   │   backend           │   │   frontend         │  │  │
│  │   │   Python FastAPI    │   │   nginx            │  │  │
│  │   │   :8000 (internal)  │   │   :3000 → :80      │  │  │
│  │   │                     │   │                    │  │  │
│  │   │  modules/           │   │  /        → SPA   │  │  │
│  │   │    co2.py           │   │  /ws      → :8000 │  │  │
│  │   │    internet.py      │   │  /api/    → :8000 │  │  │
│  │   │    plants.py        │   └────────────────────┘  │  │
│  │   │    weather.py       │                            │  │
│  │   │    <new_module>.py  │                            │  │
│  │   │                     │                            │  │
│  │   │  WebSocket /ws      │                            │  │
│  │   └─────────────────────┘                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                     │                                      │
│  ┌──────────────────┼───────────────────────────────────┐  │
│  │  External Docker networks                            │  │
│  │  dadjet_co2_co2net → co2mond:9999/metrics            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Wayland (labwc) + Chromium kiosk                    │  │
│  │  http://localhost:3000  (открывается при загрузке)   │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Поток данных:**

```
Внешние источники (co2mond, Open-Meteo, URLs)
        │
        ▼
  Модули backend (collect() каждые N сек)
        │
        ▼
  FastAPI WebSocket hub (broadcast)
        │
        ▼ ws://host/ws (nginx proxy)
  React App в Chromium
        │
        ▼
  Widget Registry → виджеты на активной странице
```

---

## Структура проекта

```
pi-dashboard/
│
├── manage.sh                   # Управление: deploy/restart/stop/logs/kiosk
├── docker-compose.yml          # Compose-стек: backend + frontend
├── .env                        # Конфиг (gitignored) — скопировать из .env.example
├── .env.example                # Шаблон конфига
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── config.yaml             # Модули и их параметры (использует ${VAR} из .env)
│   ├── main.py                 # FastAPI: WebSocket hub, module runner, API
│   └── modules/
│       ├── base.py             # BaseModule — абстрактный класс
│       ├── co2.py              # CO2 + температура (co2mond Prometheus)
│       ├── internet.py         # Ping интернет-таргетов
│       ├── plants.py           # Датчики влажности растений (Pushgateway)
│       └── weather.py          # Погода (Open-Meteo API)
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── App.tsx             # Корневой компонент: страницы, навигация тапом
│       ├── dashboard.config.ts # Страницы и слоты виджетов
│       ├── vite-env.d.ts       # Типы для import.meta.env (VITE_* переменные)
│       ├── types/index.ts      # TypeScript-типы данных модулей
│       ├── hooks/
│       │   └── useWebSocket.ts # WS-клиент с авто-реконнектом
│       └── widgets/
│           ├── registry.ts     # РЕЕСТР: widget_id → React-компонент
│           ├── ClockWidget.tsx
│           ├── CO2Widget.tsx
│           ├── InternetWidget.tsx
│           ├── PlantsWidget.tsx
│           ├── WeatherWidget.tsx
│           └── TempRoomWidget.tsx
│
└── start-kiosk.sh              # Запуск Chromium kiosk (ждёт :3000)
```

---

## Технологии

| Слой | Что | Зачем |
|------|-----|-------|
| **Backend** | Python + FastAPI | Async, WebSocket из коробки |
| **Transport** | WebSocket | Сервер пушит данные — нет polling |
| **HTTP-клиент** | httpx | Async HTTP для модулей |
| **Frontend** | React + Vite + TypeScript | Компонент = виджет |
| **Стили** | TailwindCSS | Быстро, без кастомного CSS |
| **Proxy** | nginx | Один порт наружу, WS proxy |
| **Deploy** | Docker Compose | Изолировано, авто-старт |
| **Display** | Chromium kiosk | Под Wayland, без UI браузера |

---

## Модули бэкенда

`main.py` читает `config.yaml`, инстанцирует модули и запускает каждый в asyncio-таске. Таск вызывает `collect()` каждые `interval` секунд и бродкастит всем WS-клиентам.

**WebSocket message format:**
```json
{ "module": "co2", "ok": true, "data": { "ppm": 727, "temp": 24.0 } }
```
При ошибке: `{ "module": "co2", "ok": false, "data": null, "error": "..." }`

При подключении клиент сразу получает snapshot всех модулей.

### Существующие модули

| ID | Файл | Источник данных | Поля |
|----|------|----------------|------|
| `co2` | `co2.py` | co2mond `:9999/metrics` | `ppm`, `temp` |
| `internet` | `internet.py` | HTTP GET к таргетам | `online`, `targets[]` |
| `plants` | `plants.py` | Pushgateway `/api/v1/metrics` | `plants[]` (name, humidity, humidity_min, humidity_max, temp, battery, image_url) |

**Картинки растений** (`/api/plants/image/{name}`) проксируются бэкендом через SOCKS5 и кэшируются на диск в `/tmp/plant_images/` внутри контейнера. При повторных запросах отдаются с диска без обращения к `img.artfaal.ru`. Кэш сбрасывается только при пересоздании контейнера (`docker compose up --build`).
| `weather` | `weather.py` | Open-Meteo API | `temp`, `feels_like`, `humidity`, `wind_speed`, `wind_dir`, `wind_gusts`, `pressure` (гПа), `precipitation`, `uv_index`, `condition`, `description`, `is_day`, `temp_max`, `temp_min`, `precip_today`, `sunrise`, `sunset` |

---

## Виджеты фронтенда

### Страницы и навигация

Страницы и состав виджетов задаются в `dashboard.config.ts`:

```typescript
export const DASHBOARD_CONFIG = {
  pages: [
    { id: 'home', label: 'Главная', slots: [
      { widgetId: 'co2',      moduleId: 'co2'      },
      { widgetId: 'weather',  moduleId: 'weather'  },
      { widgetId: 'internet', moduleId: 'internet' },
    ]},
    { id: 'plants', label: 'Растения', slots: [
      { widgetId: 'plants', moduleId: 'plants' },
    ]},
  ],
  // Значения берутся из .env через VITE_ROTATE_ENABLED / VITE_ROTATE_INTERVAL
  rotate: { enabled: ..., intervalSeconds: ... },
}
```

**Навигация (тачскрин):**
- **Тап** в любом месте экрана → следующая страница (циклически)
- **Свайп влево** → следующая страница, **свайп вправо** → предыдущая
- **Тап на «Pi Dashboard»** (шапка) → выход из kiosk
- Долгое нажатие (> 500ms) игнорируется

Авторотация управляется через `VITE_ROTATE_ENABLED` / `VITE_ROTATE_INTERVAL` в `.env`.

> ft5x06 DSI-тачскрин регистрируется как `mouse0`, поэтому навигация реализована через Pointer Events (не Touch Events).

**Навигация (macro-клавиатура):**

Физическое устройство: мини-механическая клавиатура с 3 кнопками и поворотным энкодером.
Запрограммирована через Windows-ПО производителя на отправку букв `a–f`.

| Физическая кнопка | Посылает | `e.code` в JS | Действие |
|-------------------|----------|---------------|---------|
| Button A          | `a`      | `KeyA`        | Выбрать виджет левее (циклично) |
| Button B          | `b`      | `KeyB`        | Войти в виджет / выйти обратно |
| Button C          | `c`      | `KeyC`        | Выбрать виджет правее (циклично) |
| Knob нажатие      | `d`      | `KeyD`        | Выйти из виджета ИЛИ выйти из kiosk |
| Knob влево        | `e`      | `KeyE`        | Предыдущая страница |
| Knob вправо       | `f`      | `KeyF`        | Следующая страница |

### Выбор и раскрытие виджетов

Виджеты на странице можно выбирать клавишами A/C — выбранный подсвечивается indigo-рамкой. Нажатие B (или тап по виджету) разворачивает его на весь экран, показывая детальный вид (`detailWidgetId`). Выйти — клавишей B или D, а также тапом по экрану.

```
[Главная страница]               [Детальный вид — weather_detail]
┌──────┬──────┬──────┐           ┌─────────────────────────────┐
│  CO₂ │[Пог.]│ Inet │  ──B──►  │   Погода · подробно         │
│      │[====]│      │           │   +3° / ощущ. +1°           │
└──────┴──────┴──────┘           │   Ветер, давление, УФ, ...  │
   A ◄──── выбор ────► C         └─────────────────────────────┘
                                         D / B = назад
```

Состояния клавиш в зависимости от режима:

| Клавиша | Режим страницы | Режим детального вида |
|---------|---------------|----------------------|
| A       | Выбрать влево | — (нет действия) |
| B       | Войти в виджет | Выйти назад |
| C       | Выбрать вправо | — (нет действия) |
| D       | Выйти из kiosk | Выйти назад |
| E / F   | Смена страницы | Смена страницы + выход |

> Используется `e.code` (физическая позиция клавиши), а не `e.key` (символ) — поэтому язык раскладки на Pi не влияет на работу клавиатуры.

### Как добавить детальный вид для виджета

1. Создать `MyDetailWidget.tsx` в `src/widgets/`
2. Зарегистрировать в `registry.ts`: `my_detail: MyDetailWidget`
3. Добавить `detailWidgetId: 'my_detail'` к нужному слоту в `dashboard.config.ts`:

```typescript
{ widgetId: 'my_widget', moduleId: 'my_module', detailWidgetId: 'my_detail' }
```

Если `detailWidgetId` не задан — при раскрытии показывается тот же виджет, только полноэкранно.

### Реестр виджетов

`widgets/registry.ts` связывает `widgetId` → React-компонент.

### Доступные виджеты

| `widgetId` | Компонент | Источник (`moduleId`) | Что показывает |
|------------|-----------|----------------------|----------------|
| `co2` | `CO2Widget` | `co2` | Круговой gauge CO₂, sparkline, уровень |
| `internet` | `InternetWidget` | `internet` | Online/Offline, список таргетов с latency |
| `plants` | `PlantsWidget` | `plants` | N карточек на экран (`VITE_PLANTS_PER_PAGE`), фото, бар влажности min–max, статус ↓/✓/↑, температура, боковая пагинация |
| `weather` | `WeatherWidget` | `weather` | Температура, ощущается, влажность, ветер, диапазон дня |
| `weather_detail` | `WeatherDetailWidget` | `weather` | Подробный вид: ветер+порывы, давление, УФ-индекс, осадки за день, восход/закат, бар диапазона дня |
| `temp_room` | `TempRoomWidget` | `co2` | Температура в помещении, comfort range |
| *(header)* | `ClockWidget` | *(local)* | Часы HH:MM:SS + дата |

Все виджеты принимают `{ data: unknown; error?: string }` — интерфейс `WidgetProps`.

---

## Конфигурация (.env)

Все настраиваемые параметры вынесены в `.env` (создать из `.env.example`).

**Два типа переменных:**
- Обычные — читаются бэкендом в рантайме (`env_file: .env` в docker-compose)
- `VITE_*` — передаются как Docker build args и **встраиваются Vite при сборке** фронтенда; изменение требует rebuild (`./manage.sh deploy`)

```env
# ── Pi connection (используется manage.sh) ────────────────────────────────────
PI_HOST=192.168.2.215
PI_USER=artfaal
PI_PATH=/home/artfaal/pi-dashboard

# ── Dashboard ─────────────────────────────────────────────────────────────────
FRONTEND_PORT=3000

# ── Авторотация страниц (VITE — rebuild при изменении) ───────────────────────
VITE_ROTATE_ENABLED=false       # true — листать страницы автоматически
VITE_ROTATE_INTERVAL=20         # интервал авторотации, секунды

# ── CO2 виджет (VITE — rebuild при изменении) ─────────────────────────────────
VITE_CO2_OK=800                 # порог «Хорошо», ppm
VITE_CO2_WARN=1000              # порог «Норма»
VITE_CO2_BAD=1500               # порог «Высокий»
VITE_CO2_MAX=2000               # максимум шкалы gauge
VITE_CO2_HISTORY=30             # точек в sparkline

# ── Температура (VITE — rebuild при изменении) ────────────────────────────────
VITE_TEMP_COLD=18               # нижняя граница комфортной зоны, °C
VITE_TEMP_WARM=24               # верхняя граница
VITE_TEMP_SCALE_MIN=10          # минимум шкалы бара
VITE_TEMP_SCALE_MAX=40          # максимум шкалы бара

# ── Растения — фронтенд (VITE — rebuild при изменении) ───────────────────────
VITE_PLANTS_PER_PAGE=3          # карточек на экране одновременно

# ── CO2 сенсор ────────────────────────────────────────────────────────────────
CO2_METRICS_URL=http://co2mond:9999/metrics
CO2_INTERVAL=30

# ── Погода (Open-Meteo, без API ключа) ────────────────────────────────────────
WEATHER_LAT=55.7558
WEATHER_LON=37.6176
WEATHER_TZ=Europe/Moscow
WEATHER_LOCATION=Москва
WEATHER_INTERVAL=600

# ── Интернет ──────────────────────────────────────────────────────────────────
INTERNET_INTERVAL=30

# ── Растения — бэкенд ─────────────────────────────────────────────────────────
PLANTS_PUSHGATEWAY_URL=https://pushgateway.example.com
PLANTS_INTERVAL=300
PLANTS_IMAGE_BASE_URL=https://img.example.com/plants
PLANTS_IMAGE_TIMEOUT=10
PLANTS_PROXY_HOST=              # SOCKS5 прокси (опционально)
PLANTS_PROXY_PORT=1080
PLANTS_PROXY_USER=
PLANTS_PROXY_PASSWORD=
```

`backend/config.yaml` использует `${VAR}` — подстановка через `os.path.expandvars()` в `main.py`.

---

## Управление (manage.sh)

```bash
# Полный деплой: sync + .env + rebuild + restart + kiosk
./manage.sh deploy

# Только перезапустить контейнеры (без rebuild — для изменений бэкенд-конфига)
./manage.sh restart

# Другие команды
./manage.sh sync            # синхронизировать файлы (включая .env) без rebuild
./manage.sh stop            # остановить контейнеры
./manage.sh start           # запустить контейнеры
./manage.sh logs            # логи всех сервисов
./manage.sh logs backend    # логи конкретного сервиса
./manage.sh status          # статус контейнеров
./manage.sh kiosk           # перезапустить Chromium на Pi
./manage.sh kiosk-stop      # закрыть Chromium kiosk
```

> `.env` при `deploy` и `sync` всегда принудительно перезаписывается на Pi (`--ignore-times`), даже если удалённый файл новее.
>
> Изменение `VITE_*` переменных вступает в силу только после `deploy` (требуется пересборка фронтенда).

---

## Настройки на Pi вне контейнеров

### labwc autostart — `~/.config/labwc/autostart`

```bash
/usr/bin/wlr-randr --output DSI-1 --on &
/home/artfaal/pi-dashboard/start-kiosk.sh &
```

### Kiosk-скрипт — `start-kiosk.sh`

Ждёт пока `:3000` ответит, потом **очищает остатки предыдущего сеанса** и запускает Chromium:

```bash
rm -f ~/.config/chromium/SingletonLock      # стейл-лок после краша
rm -rf ~/.config/chromium/Default/GPUCache  # битый GPU-кэш → SIGTRAP при старте
rm -rf ~/.config/chromium/Default/ShaderCache
exec /usr/bin/chromium ...
```

Ключевые флаги Chromium:
- `--kiosk` — полный экран без UI
- `--password-store=basic` — **критично**: без него GNOME Keyring блокирует запуск
- `--ozone-platform=wayland` — Wayland backend
- `--disable-restore-session-state` — не восстанавливать упавшую сессию
- `--disable-features=Translate` — скрыть панель перевода

### Политика Chromium — `/etc/chromium/policies/managed/disable_translate.json`

```json
{"TranslateEnabled": false}
```

Системный запрет предложения перевода. Создать командой:
```bash
sudo mkdir -p /etc/chromium/policies/managed
echo '{"TranslateEnabled": false}' | sudo tee /etc/chromium/policies/managed/disable_translate.json
```

### Docker network — `dadjet_co2_co2net`

Backend подключён к внешней сети `dadjet_co2_co2net` (стек `~/dadjet_co2/`).
Это даёт доступ к `co2mond` по имени: `http://co2mond:9999/metrics`.

---

## Как добавить новый модуль

### 1. Backend — создать модуль

```python
# backend/modules/my_sensor.py
import httpx
from .base import BaseModule

class MySensorModule(BaseModule):
    module_id = "my_sensor"
    interval = 60

    def __init__(self, sensor_url: str = "http://sensor/api") -> None:
        self.sensor_url = sensor_url

    async def collect(self) -> dict:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(self.sensor_url)
            r.raise_for_status()
        return {"value": r.json()["value"]}
```

### 2. Backend — зарегистрировать в `main.py`

```python
from modules.my_sensor import MySensorModule

MODULE_REGISTRY = {
    ...,
    "my_sensor": MySensorModule,
}
```

### 3. Backend — включить в `config.yaml`

```yaml
- id: my_sensor
  enabled: true
  interval: 60
  config:
    sensor_url: "${MY_SENSOR_URL}"
```

### 4. Frontend — добавить тип данных

```typescript
// src/types/index.ts
export interface MySensorData { value: number }
```

### 5. Frontend — создать виджет

```tsx
// src/widgets/MySensorWidget.tsx
import type { WidgetProps } from '../types'

export function MySensorWidget({ data, error }: WidgetProps) {
  const d = data as { value: number } | null
  if (!d) return <div>{error ?? 'Ожидание…'}</div>
  return <div>{d.value}</div>
}
```

### 6. Frontend — зарегистрировать в `registry.ts`

```typescript
import { MySensorWidget } from './MySensorWidget'

export const WIDGET_REGISTRY = {
  ...,
  my_sensor: MySensorWidget,
}
```

### 7. Frontend — добавить в страницу в `dashboard.config.ts`

```typescript
{ widgetId: 'my_sensor', moduleId: 'my_sensor' }
```

### 8. Деплой

```bash
./manage.sh deploy
```

---

## Известные нюансы

### `--password-store=basic` в Chromium

Без этого флага Chromium показывает диалог GNOME Keyring при каждом старте — ломает kiosk. Флаг прописан в `start-kiosk.sh`.

### Chromium падает с SIGTRAP после краша

Если Chromium завершился некорректно (kill, перезагрузка), он оставляет `SingletonLock` и/или битый GPU-кэш. При следующем старте это вызывает SIGTRAP ещё до отрисовки. `start-kiosk.sh` автоматически удаляет эти артефакты при каждом запуске. Если проблема не исчезает — удалить весь профиль:

```bash
ssh artfaal@192.168.2.215 "pkill -x chromium; mv ~/.config/chromium ~/.config/chromium.bak"
./manage.sh kiosk
```

### DBUS_SESSION_BUS_ADDRESS при запуске из SSH

Без этой переменной labwc не активирует окно Chromium через xdg-activation — процесс запускается, но окно остаётся невидимым. `manage.sh kiosk` и `deploy` передают полное окружение через `KIOSK_ENV`.

### EDID ошибка в логах labwc

```
[ERROR] Failed to parse EDID
```

Нормально для DSI-дисплея — у него нет стандартного EDID. Игнорировать.

### Порядок запуска

`dadjet_co2` стек должен быть запущен до нашего backend — иначе сеть `dadjet_co2_co2net` не существует. На практике не проблема: оба стека имеют `restart: unless-stopped`.

### Выйти из kiosk вручную

```bash
./manage.sh kiosk-stop
# или напрямую:
ssh artfaal@192.168.2.215 "pkill -x chromium"
```
