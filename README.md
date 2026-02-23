# Pi Dashboard

Модульный home-дашборд для **Raspberry Pi 4B** с 7-дюймовым DSI-дисплеем.
Работает как полноэкранное Chromium-приложение в kiosk-режиме под Wayland (labwc).

---

## Содержание

1. [Как это выглядит](#как-это-выглядит)
2. [Архитектура](#архитектура)
3. [Структура проекта](#структура-проекта)
4. [Технологии](#технологии)
5. [Модули бэкенда](#модули-бэкенда)
6. [Виджеты фронтенда](#виджеты-фронтенда)
7. [Деплой и обновление](#деплой-и-обновление)
8. [Настройки на Pi вне контейнеров](#настройки-на-pi-вне-контейнеров)
9. [Как добавить новый модуль](#как-добавить-новый-модуль)
10. [Полезные команды](#полезные-команды)
11. [Известные нюансы](#известные-нюансы)

---

## Как это выглядит

```
┌─────────────────────────────────────────────────────────────────────┐
│  ● live   Pi Dashboard                          Пн, 23 Фев  14:32  │
├──────────────────┬──────────────────┬───────────────────────────────┤
│                  │                  │                               │
│  CO₂             │  Температура     │  Интернет                     │
│                  │                  │                               │
│   ┌──(gauge)──┐  │      24.0        │  ● Online                     │
│   │   727     │  │       °C         │                               │
│   │   ppm     │  │   [Комфортно]    │  Google      ████████  108ms  │
│   └───────────┘  │                  │  Cloudflare  ████████  105ms  │
│   [Хорошо]       │  ═══▓════  10-40°│  Яндекс      ████████   84ms  │
│   ▁▂▃▄▅▅▆▆▇      │                  │                               │
│   24.0 °C        │                  │                               │
└──────────────────┴──────────────────┴───────────────────────────────┘
         800 × 480 px (7" DSI display, landscape)
```

**Дисплей:** 800×480, ориентация — landscape
**Цвета CO₂:** зелёный < 800 ppm → жёлтый 800–1000 → оранжевый 1000–1500 → красный > 1500

---

## Архитектура

```
                    Raspberry Pi 4B
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
│  │   │  ┌───────────────┐  │   │  /        → SPA   │  │  │
│  │   │  │ co2 module    │  │   │  /ws      → :8000 │  │  │
│  │   │  │ internet mod. │  │   │  /api/    → :8000 │  │  │
│  │   │  │ <your module> │  │   └────────────────────┘  │  │
│  │   │  └───────────────┘  │                            │  │
│  │   │  WebSocket /ws       │                            │  │
│  │   └─────────────────────┘                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                     │                                      │
│  ┌──────────────────┼───────────────────────────────────┐  │
│  │  External Docker │networks                           │  │
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
co2mond:9999        Internet targets
     │                    │
     ▼                    ▼
 CO2Module         InternetModule
     │                    │
     └──────┬─────────────┘
            ▼
    FastAPI WebSocket hub  (broadcasts every N seconds)
            │
            ▼ ws://localhost:3000/ws  (proxied by nginx)
    React App в Chromium
            │
     ┌──────┴───────┐
     ▼              ▼
  CO2Widget   InternetWidget  …
```

---

## Структура проекта

```
pi-dashboard/
│
├── docker-compose.yml          # Compose-стек: backend + frontend
├── .env.example                # Шаблон env (сейчас секретов нет)
│
├── backend/
│   ├── Dockerfile              # python:3.12-slim → uvicorn
│   ├── requirements.txt        # fastapi, uvicorn, httpx, pyyaml
│   ├── config.yaml             # ← ГЛАВНЫЙ КОНФИГ: модули, интервалы, параметры
│   ├── main.py                 # FastAPI app: WebSocket hub, lifespan, API endpoints
│   └── modules/
│       ├── base.py             # BaseModule — абстрактный класс для модулей
│       ├── co2.py              # CO2Module: читает Prometheus метрики co2mond
│       └── internet.py         # InternetModule: проверяет доступность URL
│
├── frontend/
│   ├── Dockerfile              # node:22 build → nginx:stable-alpine serve
│   ├── nginx.conf              # SPA + reverse proxy /ws и /api/ → backend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── index.html              # viewport=800 для 7" дисплея
│   └── src/
│       ├── main.tsx
│       ├── App.tsx             # Корневой компонент: layout, WS-клиент, grid
│       ├── index.css           # Tailwind + кастомные utility (.card, .glow-*)
│       ├── types/
│       │   └── index.ts        # ModulePayload, CO2Data, InternetData, …
│       ├── hooks/
│       │   └── useWebSocket.ts # WS-клиент с авто-реконнектом (3s backoff)
│       └── widgets/
│           ├── registry.ts     # ← РЕЕСТР ВИДЖЕТОВ: module_id → компонент
│           ├── ClockWidget.tsx # Часы + дата в header
│           ├── CO2Widget.tsx   # Круговой gauge + sparkline + уровень
│           └── InternetWidget.tsx  # Статус + список таргетов с латентностью
│
└── start-kiosk.sh              # Скрипт запуска Chromium (ждёт :3000, потом kiosk)
```

---

## Технологии

| Слой | Что | Версия | Зачем |
|------|-----|--------|-------|
| **Backend** | Python + FastAPI | 3.12 / 0.115 | Async, WebSocket из коробки, лёгкий |
| **Transport** | WebSocket | — | Сервер пушит данные сам — нет клиентского polling |
| **HTTP-клиент** | httpx | 0.28 | Async HTTP для модулей |
| **Frontend** | React + Vite | 18 / 6 | Компонент = виджет, HMR при разработке |
| **Стили** | TailwindCSS | 3.4 | Быстро красиво без кастомного CSS |
| **Proxy** | nginx | stable-alpine | Один порт наружу, WS proxy, статика |
| **Deploy** | Docker Compose | 29.2 | Уже используется на Pi |
| **Display** | Chromium kiosk | — | Уже стоит, работает под Wayland |
| **WM** | labwc (Wayland) | — | Стандартный для Raspberry Pi OS |

---

## Модули бэкенда

### Как это работает

`main.py` при старте читает `config.yaml`, создаёт инстансы модулей и запускает каждый в отдельном asyncio-таске. Таск вызывает `module.collect()` каждые `interval` секунд и бродкастит результат всем подключённым WebSocket-клиентам.

Формат сообщения по WebSocket:
```json
{
  "module": "co2",
  "ok": true,
  "data": { "ppm": 727, "temp": 24.0 }
}
```

При ошибке:
```json
{
  "module": "co2",
  "ok": false,
  "data": null,
  "error": "Connection refused"
}
```

При подключении нового WS-клиента он сразу получает последний snapshot всех модулей — не ждёт следующего цикла.

### Существующие модули

#### `co2` — CO₂ и температура

- **Источник:** `http://co2mond:9999/metrics` — Prometheus text format
- **Контейнер co2mond** живёт в сети `dadjet_co2_co2net`, наш backend к ней подключён
- **Данные:** `ppm` (целое), `temp` (float, °C)
- **Параметры в config.yaml:** `metrics_url`

```yaml
- id: co2
  enabled: true
  interval: 30
  config:
    metrics_url: "http://co2mond:9999/metrics"
```

#### `internet` — Доступность интернета

- **Источник:** HTTP GET к списку URL, измеряем latency
- **Данные:** `online` (bool), `targets` (список `{name, ok, ms}`)
- **Параметры в config.yaml:** `targets` — список `{name, url}`

```yaml
- id: internet
  enabled: true
  interval: 30
  config:
    targets:
      - name: "Google"
        url: "https://8.8.8.8"
      - name: "Cloudflare"
        url: "https://1.1.1.1"
```

---

## Виджеты фронтенда

### Реестр

`src/widgets/registry.ts` — словарь `module_id → React-компонент`. Именно здесь связывается ID модуля с тем, какой компонент его рендерит.

### Текущие виджеты

| Виджет | Источник | Что показывает |
|--------|----------|----------------|
| `ClockWidget` | локальное время браузера | Часы HH:MM:SS + дата в header |
| `CO2Widget` | модуль `co2` | Круговой gauge, уровень (цвет), sparkline истории |
| `InternetWidget` | модуль `internet` | Online/Offline + список таргетов с latency bar |
| `TempWidget` | модуль `co2` | Большое число температуры + comfort range bar |

### Данные в App.tsx

```
useWebSocket(WS_URL)
  → data['co2']       → CO2Widget + TempWidget
  → data['internet']  → InternetWidget
```

`App.tsx` также накапливает историю CO₂ в локальном state (последние 30 точек) для sparkline.

### WS URL

```typescript
// frontend/src/App.tsx
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`
```

Использует `window.location.host` — работает и с `localhost:3000` (с Pi), и с `192.168.2.215:3000` (удалённо для отладки).

---

## Деплой и обновление

### Первый деплой

```bash
# На локальной машине — синхронизируем проект на Pi
rsync -av --exclude='.git' --exclude='node_modules' --exclude='frontend/dist' \
  . artfaal@192.168.2.215:/home/artfaal/pi-dashboard/

# На Pi — собираем и запускаем
ssh artfaal@192.168.2.215
cd /home/artfaal/pi-dashboard
docker compose build
docker compose up -d
```

### Обновление (типичный workflow)

```bash
# 1. Вносим изменения локально
# 2. Синхронизируем
rsync -av --exclude='.git' --exclude='node_modules' --exclude='frontend/dist' \
  . artfaal@192.168.2.215:/home/artfaal/pi-dashboard/

# 3. Пересобираем изменившийся образ и рестартуем
ssh artfaal@192.168.2.215 "cd /home/artfaal/pi-dashboard && docker compose up -d --build"
```

Если менялся только `config.yaml` (без кода) — достаточно рестарта без пересборки:
```bash
ssh artfaal@192.168.2.215 "cd /home/artfaal/pi-dashboard && docker compose restart backend"
```

### Авто-старт при перезагрузке Pi

`restart: unless-stopped` в `docker-compose.yml` — Docker сам поднимает контейнеры при старте демона.
Chromium стартует через `labwc autostart` → `start-kiosk.sh` (см. раздел ниже).

---

## Настройки на Pi вне контейнеров

Это важный раздел — всё, что живёт **за пределами Docker**, но необходимо для работы дашборда.

### 1. labwc autostart — `~/.config/labwc/autostart`

Этот файл labwc читает при старте Wayland-сессии. Он **перекрывает** системный `/etc/xdg/labwc/autostart`.

Текущее содержимое:
```bash
# Включаем DSI-дисплей
/usr/bin/wlr-randr --output DSI-1 --on &

# Запускаем Chromium в kiosk-режиме (через wait-скрипт)
/home/artfaal/pi-dashboard/start-kiosk.sh &
```

**Важно:** Системный autostart запускает `wf-panel-pi` (тулбар) и `pcmanfm-pi` (файловый менеджер/обои). Наш пользовательский autostart их **не запускает** — это сделано намеренно для чистого kiosk-режима. Если нужно вернуть тулбар, раскомменти `lwrespawn /usr/bin/wf-panel-pi &`.

### 2. Kiosk-скрипт — `~/pi-dashboard/start-kiosk.sh`

```bash
#!/bin/bash
URL="http://localhost:3000"

# Ждём пока frontend nginx ответит (до 60 секунд)
until curl -sf "$URL" > /dev/null 2>&1; do sleep 2; done

# Запускаем Chromium в kiosk-режиме
exec /usr/bin/chromium \
  --kiosk \                          # полный экран, нет UI браузера
  --noerrdialogs \                   # нет диалогов об ошибках
  --no-first-run \                   # нет welcome-экрана
  --ozone-platform=wayland \         # Wayland backend (не X11)
  --password-store=basic \           # ВАЖНО: отключает запрос GNOME Keyring
  --disable-session-crashed-bubble \ # нет диалога "восстановить сессию"
  --disable-restore-session-state \  # не восстанавливать прошлую сессию
  http://localhost:3000
```

**Ключевой флаг — `--password-store=basic`:** без него Chromium показывает диалог разблокировки GNOME Keyring при каждом запуске, что ломает kiosk-режим.

**Почему `exec` а не `&`:** `exec` заменяет процесс bash на chromium — нет лишнего родительского процесса, и labwc корректно отслеживает жизнь Chromium.

### 3. Docker network — `dadjet_co2_co2net`

Backend подключён к внешней сети `dadjet_co2_co2net` (создана compose-стеком `dadjet_co2`). Это позволяет обращаться к контейнеру `co2mond` по имени:
```
http://co2mond:9999/metrics
```

В `docker-compose.yml`:
```yaml
networks:
  dadjet_co2_co2net:
    external: true   # сеть уже существует, не создаём новую
```

Если `dadjet_co2` стек не запущен — backend упадёт с ошибкой при старте сети. Решение: `docker compose -f ~/dadjet_co2/docker-compose.yml up -d` перед нашим стеком.

### 4. Что НЕ настраивали (и почему не нужно)

- **systemd-сервис для Docker:** не нужен — `restart: unless-stopped` + Docker daemon в systemd достаточно
- **автологин:** уже настроен в Raspberry Pi OS для пользователя `artfaal`
- **автостарт Wayland:** уже настроен в Raspberry Pi OS (lightdm или аналог)
- **разрешение экрана:** DSI-дисплей определяется автоматически как `DSI-1` с нативным разрешением

---

## Как добавить новый модуль

Пример: добавляем модуль для мониторинга HTTP-датчика растений.

### Шаг 1 — Backend: создать файл модуля

```python
# backend/modules/plant_sensor.py
import httpx
from .base import BaseModule

class PlantSensorModule(BaseModule):
    module_id = "plant"
    interval = 60

    def __init__(self, sensor_url: str = "http://my-sensor/api") -> None:
        self.sensor_url = sensor_url

    async def collect(self) -> dict:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(self.sensor_url)
            r.raise_for_status()
            data = r.json()
        return {
            "moisture": data["soil_moisture"],
            "name": data["plant_name"],
        }
```

### Шаг 2 — Backend: зарегистрировать в `main.py`

```python
# main.py — в MODULE_REGISTRY
from modules.plant_sensor import PlantSensorModule

MODULE_REGISTRY = {
    "co2": CO2Module,
    "internet": InternetModule,
    "plant": PlantSensorModule,   # ← добавить
}
```

### Шаг 3 — Backend: включить в `config.yaml`

```yaml
- id: plant
  enabled: true
  interval: 60
  config:
    sensor_url: "http://192.168.2.100/api"
```

### Шаг 4 — Frontend: добавить тип данных

```typescript
// src/types/index.ts
export interface PlantData {
  moisture: number
  name: string
}
```

### Шаг 5 — Frontend: создать виджет

```tsx
// src/widgets/PlantWidget.tsx
import type { PlantData } from '../types'

interface Props {
  data: PlantData | null
  error?: string
}

export function PlantWidget({ data, error }: Props) {
  if (!data) return <div>Нет данных</div>
  return (
    <div>
      <div>{data.name}</div>
      <div>Влажность: {data.moisture}%</div>
    </div>
  )
}
```

### Шаг 6 — Frontend: зарегистрировать в реестре

```typescript
// src/widgets/registry.ts
import { PlantWidget } from './PlantWidget'

export const WIDGET_REGISTRY = {
  co2: CO2Widget,
  internet: InternetWidget,
  plant: PlantWidget,           // ← добавить
}
```

### Шаг 7 — Frontend: добавить в layout (`App.tsx`)

```tsx
// В grid в App.tsx
const plantPayload = data['plant']
const plantData = plantPayload?.ok ? (plantPayload.data as PlantData) : null

// В JSX:
<WidgetCard>
  <PlantWidget data={plantData} error={plantPayload?.error} />
</WidgetCard>
```

### Шаг 8 — Пересобрать и задеплоить

```bash
rsync -av --exclude='.git' --exclude='node_modules' . artfaal@192.168.2.215:/home/artfaal/pi-dashboard/
ssh artfaal@192.168.2.215 "cd /home/artfaal/pi-dashboard && docker compose up -d --build"
```

---

## Полезные команды

### На локальной машине

```bash
# Синхронизировать файлы на Pi
rsync -av --exclude='.git' --exclude='node_modules' --exclude='frontend/dist' \
  . artfaal@192.168.2.215:/home/artfaal/pi-dashboard/

# Открыть дашборд в браузере для проверки (с локальной машины)
open http://192.168.2.215:3000
```

### На Pi (ssh artfaal@192.168.2.215)

```bash
cd /home/artfaal/pi-dashboard

# Статус контейнеров
docker compose ps

# Логи в реальном времени
docker compose logs -f backend
docker compose logs -f frontend

# Пересобрать и перезапустить всё
docker compose up -d --build

# Перезапустить только backend (если менялся config.yaml или Python)
docker compose restart backend

# Проверить что API отвечает
curl http://localhost:3000/api/snapshot | python3 -m json.tool

# Проверить co2mond напрямую
curl http://172.20.0.2:9999/metrics

# Запустить Chromium вручную (без перезагрузки)
WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 \
  /home/artfaal/pi-dashboard/start-kiosk.sh &

# Убить Chromium
pkill -f chromium
```

---

## Известные нюансы

### Chromium и GNOME Keyring

Без флага `--password-store=basic` Chromium показывает диалог разблокировки системного keyring при каждом старте. Это ломает kiosk-режим (появляется диалог поверх дашборда). Флаг уже прописан в `start-kiosk.sh`.

### EDID ошибка в логах labwc

```
[ERROR] [backend/drm/util.c:65] Failed to parse EDID
```

Это нормально для DSI-дисплея Raspberry Pi — у него нет стандартного EDID. Дисплей работает корректно, ошибку игнорируем.

### Порядок запуска контейнеров

`dadjet_co2` стек (`co2mond`, `co2push`) должен быть запущен **до** нашего backend, иначе сеть `dadjet_co2_co2net` не существует и `docker compose up` упадёт. На практике это не проблема, т.к. оба стека имеют `restart: unless-stopped` и docker-daemon стартует их автоматически.

### Разрешение экрана

Frontend оптимизирован под **800×480** (стандартное разрешение 7" Pi дисплея). В `index.html` прописан `content="width=800"`. Если дисплей другого разрешения — правим viewport и grid в `App.tsx`.

### Kiosk vs обычный режим

Когда нужно выйти из kiosk (например, для отладки):
- Подключиться по SSH и `pkill -f chromium`
- После этого labwc покажет рабочий стол (если wf-panel-pi не запущен — будет пустой экран)
- Вернуть нормальный вид: `WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 wf-panel-pi &`

### HMR при разработке

Для локальной разработки можно запустить frontend dev-сервер и проксировать API на Pi:
```bash
# В frontend/vite.config.ts можно добавить proxy:
server: {
  proxy: {
    '/ws':  { target: 'ws://192.168.2.215:3000', ws: true },
    '/api': { target: 'http://192.168.2.215:3000' },
  }
}
```
Тогда `npm run dev` локально будет брать данные с Pi.

---

## Pi — железо и окружение

| Параметр | Значение |
|----------|----------|
| Железо | Raspberry Pi 4B |
| ОС | Debian 13 (Trixie) aarch64 |
| Дисплей | 7" DSI, `DSI-1`, 800×480 |
| WM | labwc (Wayland compositor) |
| Браузер | Chromium `/usr/bin/chromium` |
| Docker | 29.2.1 |
| IP | 192.168.2.215 |
| Пользователь | artfaal |
| Проект на Pi | `/home/artfaal/pi-dashboard/` |
| Другие compose-стеки | `~/dadjet_co2/` (co2mond, co2push), `~/tuya-exporter/`, `~/divoom/` |
