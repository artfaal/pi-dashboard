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
│  │   │    router.py        │                            │  │
│  │   │    proxy.py         │                            │  │
│  │   │    torrent.py       │                            │  │
│  │   │    weather.py       │                            │  │
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
Внешние источники (co2mond, Open-Meteo, URLs, SSH, прокси)
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
│       ├── internet.py         # Пинг HTTP-таргетов + DNS resolve
│       ├── plants.py           # Датчики влажности растений (Pushgateway)
│       ├── proxy.py            # Проверка прокси: SOCKS5/HTTP/HTTPS/SS/Trojan
│       ├── router.py           # Статистика роутера (OpenWrt SSH)
│       ├── torrent.py          # Transmission RPC + disk space via SSH
│       └── weather.py          # Погода (Open-Meteo API)
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── App.tsx             # Корневой компонент: страницы, навигация, клавиатура
│       ├── dashboard.config.ts # Страницы и слоты виджетов
│       ├── vite-env.d.ts       # Типы для import.meta.env (VITE_* переменные)
│       ├── types/index.ts      # TypeScript-типы данных модулей
│       ├── hooks/
│       │   └── useWebSocket.ts # WS-клиент с авто-реконнектом
│       └── widgets/
│           ├── registry.ts           # РЕЕСТР: widget_id → React-компонент
│           ├── ClockWidget.tsx
│           ├── CO2Widget.tsx
│           ├── InternetWidget.tsx
│           ├── InternetDetailWidget.tsx
│           ├── PlantsWidget.tsx
│           ├── PlantsDetailWidget.tsx
│           ├── ProxyWidget.tsx
│           ├── ProxyDetailWidget.tsx
│           ├── RouterWidget.tsx
│           ├── WeatherWidget.tsx
│           ├── WeatherDetailWidget.tsx
│           ├── TempRoomWidget.tsx
│           ├── TorrentWidget.tsx
│           └── TorrentDetailWidget.tsx
│
└── start-kiosk.sh              # Запуск Chromium kiosk (ждёт :3000)
```

---

## Технологии

| Слой | Что | Зачем |
|------|-----|-------|
| **Backend** | Python + FastAPI | Async, WebSocket из коробки |
| **Transport** | WebSocket | Сервер пушит данные — нет polling |
| **HTTP-клиент** | httpx + socksio | Async HTTP, поддержка SOCKS5/HTTP прокси |
| **SSH-клиент** | asyncssh | Async SSH к роутеру (OpenWrt) и медиа-серверу (диски) |
| **Torrent-клиент** | transmission-rpc | Синхронный RPC-клиент Transmission (запускается в executor) |
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
| `internet` | `internet.py` | HTTP GET к таргетам + DNS | `online`, `targets[]` (name, ok, ms), `dns_ok`, `dns_ms` |
| `plants` | `plants.py` | Pushgateway `/api/v1/metrics` | `plants[]` (name, humidity, humidity_min, humidity_max, temp, battery, image_url) |
| `weather` | `weather.py` | Open-Meteo API | `temp`, `feels_like`, `humidity`, `wind_speed`, `wind_dir`, `wind_gusts`, `pressure` (гПа), `precipitation`, `uv_index`, `condition`, `description`, `is_day`, `temp_max`, `temp_min`, `precip_today`, `sunrise`, `sunset` |
| `router` | `router.py` | SSH → OpenWrt (192.168.2.1) | `wan_ip`, `uptime_secs`, `dhcp_clients`, `wan_rx_bps`, `wan_tx_bps` |
| `proxy` | `proxy.py` | HTTP/SOCKS/TLS тесты с Pi | `ok`, `proxies[]` (name, type, ok, ms, exit_ip, exit_isp, error) — SOCKS5, HTTP, HTTPS, SS (TCP), Trojan (TLS) |
| `torrent` | `torrent.py` | Transmission RPC + SSH → медиа-сервер | `downloading` (активный торрент или null), `recent[]` (до 10, по дате), `speed` (download_bps, upload_bps), `disks[]` (name, mount, total_gb, free_gb, used_pct) |

**Картинки растений** (`/api/plants/image/{name}`) проксируются бэкендом через SOCKS5 и кэшируются на диск в `/tmp/plant_images/` внутри контейнера. При повторных запросах отдаются с диска без обращения к `img.artfaal.ru`. Кэш сбрасывается только при пересоздании контейнера.

---

## Виджеты фронтенда

### Страницы и навигация

Страницы и состав виджетов задаются в `dashboard.config.ts`:

```typescript
export const DASHBOARD_CONFIG = {
  pages: [
    { id: 'home', label: 'Главная', slots: [
      { widgetId: 'co2',      moduleId: 'co2'      },
      { widgetId: 'weather',  moduleId: 'weather',  detailWidgetId: 'weather_detail'  },
      { widgetId: 'internet', moduleId: 'internet', detailWidgetId: 'internet_detail' },
    ]},
    { id: 'network', label: 'Сеть', slots: [
      { widgetId: 'router', moduleId: 'router' },
      { widgetId: 'proxy',  moduleId: 'proxy',  detailWidgetId: 'proxy_detail' },
    ]},
    { id: 'media', label: 'Медиа', slots: [
      { widgetId: 'torrent', moduleId: 'torrent', detailWidgetId: 'torrent_detail' },
    ]},
    { id: 'plants', label: 'Растения', slots: [
      { widgetId: 'plants', moduleId: 'plants', detailWidgetId: 'plants_detail' },
    ]},
  ],
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

| Физическая кнопка | Посылает | `e.code` | Режим страницы | Режим детального вида |
|-------------------|----------|----------|---------------|----------------------|
| Button A          | `a`      | `KeyA`   | Выбрать виджет левее (циклично) | — |
| Button B          | `b`      | `KeyB`   | Войти в виджет | Выйти назад |
| Button C          | `c`      | `KeyC`   | Выбрать виджет правее (циклично) | — |
| Knob нажатие      | `d`      | `KeyD`   | Выйти из kiosk | Выйти назад |
| Knob влево        | `e`      | `KeyE`   | Предыдущая страница | Прокрутить вверх |
| Knob вправо       | `f`      | `KeyF`   | Следующая страница | Прокрутить вниз |

> Используется `e.code` (физическая позиция клавиши), а не `e.key` — язык раскладки на Pi не влияет.

### Выбор и раскрытие виджетов

Виджеты на странице можно выбирать клавишами A/C — выбранный подсвечивается indigo-рамкой. Нажатие B (или тап по виджету) разворачивает его на весь экран, показывая детальный вид (`detailWidgetId`). Выйти — клавишей B или D, а также тапом по экрану.

В развёрнутом виджете **энкодер прокручивает содержимое** (↑/↓ на высоту видимой области). Это полезно когда контент не вмещается на экран — списки прокси, страницы растений.

```
[Главная страница]               [Детальный вид — proxy_detail]
┌──────┬──────┬──────┐           ┌─────────────────────────────┐
│Router│[Prox]│      │  ──B──►  │   Proxy / VPN · подробно    │  ▲
│      │[====]│      │           │   ● SOCKS5    ...    300ms  │  │ Knob↑
└──────┴──────┴──────┘           │   ● HTTP      ...           │  │
   A ◄──── выбор ────► C         │   ● Trojan    ...           │  ▼ Knob↓
                                 └─────────────────────────────┘
                                       E/F = скролл · D = назад
```

### Как добавить детальный вид для виджета

1. Создать `MyDetailWidget.tsx` в `src/widgets/`
2. Зарегистрировать в `registry.ts`: `my_detail: MyDetailWidget`
3. Добавить `detailWidgetId: 'my_detail'` к нужному слоту в `dashboard.config.ts`:

```typescript
{ widgetId: 'my_widget', moduleId: 'my_module', detailWidgetId: 'my_detail' }
```

Если `detailWidgetId` не задан — при раскрытии показывается тот же виджет полноэкранно.

Детальный виджет **не должен** использовать `h-full` на корневом элементе, если его контент может не влезть на экран — тогда родительский контейнер с `overflow-y-auto` включит скролл.

### Доступные виджеты

| `widgetId` | Компонент | Источник (`moduleId`) | Что показывает |
|------------|-----------|----------------------|----------------|
| `co2` | `CO2Widget` | `co2` | Круговой gauge CO₂, sparkline, уровень |
| `internet` | `InternetWidget` | `internet` | Online/Offline, пинги с latency-баром, DNS статус |
| `internet_detail` | `InternetDetailWidget` | `internet` | Все цели с барами, DNS резолв, статистика |
| `plants` | `PlantsWidget` | `plants` | Компактная сетка 5×N: все растения сразу — фото + цветной процент влажности |
| `plants_detail` | `PlantsDetailWidget` | `plants` | Детальные карточки по 3 на экране: фото, бар влажности, температура; энкодер E/F листает постранично |
| `proxy` | `ProxyWidget` | `proxy` | Цветные точки по 5 прокси (SOCKS5, HTTP, HTTPS, SS, Trojan) с latency |
| `proxy_detail` | `ProxyDetailWidget` | `proxy` | Карточки: протокол, latency, exit IP + ISP (или ошибка); скролл энкодером |
| `router` | `RouterWidget` | `router` | WAN IP, аптайм, кол-во DHCP-клиентов, скорость WAN ↓/↑ |
| `weather` | `WeatherWidget` | `weather` | Температура, ощущается, влажность, ветер, диапазон дня |
| `weather_detail` | `WeatherDetailWidget` | `weather` | Ветер+порывы, давление, УФ-индекс, осадки, восход/закат, бар диапазона |
| `temp_room` | `TempRoomWidget` | `co2` | Температура в помещении, comfort range |
| `torrent` | `TorrentWidget` | `torrent` | Активная загрузка (если есть) с прогресс-баром, список последних 10 торрентов, свободное место на 3 дисках |
| `torrent_detail` | `TorrentDetailWidget` | `torrent` | Крупная карточка активной загрузки (скорость, ETA, пиры), полный список с прогресс-барами, детальные диски с цветовой кодировкой |
| *(header)* | `ClockWidget` | *(local)* | Часы HH:MM:SS + дата |

Все виджеты принимают `{ data: unknown; error?: string }` — интерфейс `WidgetProps`.

---

## Конфигурация (.env)

Все настраиваемые параметры вынесены в `.env` (создать из `.env.example`).

**Два типа переменных:**
- Обычные — читаются бэкендом в рантайме (`env_file: .env` в docker-compose)
- `VITE_*` — передаются как Docker build args и **встраиваются Vite при сборке** фронтенда; изменение требует rebuild (`./manage.sh deploy`)

```env
# ── Pi connection (используется manage.sh) ──────────────────────────────────
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
# Список сайтов для проверки. Формат: "Имя;https://url,Имя2;https://url2"
# Если не задано — используются дефолтные (Google DNS, Yandex DNS, Яндекс)
INTERNET_TARGETS="Google DNS;https://8.8.8.8,Cloudflare;https://1.1.1.1,Яндекс;https://ya.ru"

# ── Роутер (OpenWrt SSH) ───────────────────────────────────────────────────────
ROUTER_HOST=192.168.2.1
ROUTER_USER=root
ROUTER_INTERVAL=60
ROUTER_SSH_KEY_B64=<base64-encoded-private-key>  # см. раздел ниже

# ── Proxy / VPN health checks ─────────────────────────────────────────────────
PROXY_VEGA_HOST=vega.example.com
PROXY_VEGA_USER=user
PROXY_VEGA_PASS=<password>
PROXY_INTERVAL=120

# ── Torrent (Transmission RPC + disk space via SSH) ──────────────────────────
TORRENT_HOST=192.168.2.169          # IP медиа-сервера (Transmission)
TORRENT_PORT=9091
TORRENT_USER=admin
TORRENT_PASS=<password>
TORRENT_SSH_HOST=192.168.2.169      # тот же сервер, для df по SSH
TORRENT_SSH_USER=southnet-mac-server
TORRENT_INTERVAL=30
# SSH ключ — тот же ROUTER_SSH_KEY_B64 (добавить pubkey на медиа-сервер):
# cat /tmp/pi_dashboard_key.pub | ssh user@host "cat >> ~/.ssh/authorized_keys"
# ⚠️ Использовать IP, а не .local — mDNS не работает внутри Docker-контейнера

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

### Настройка SSH-ключа (роутер + медиа-сервер)

Один и тот же ключ (`ROUTER_SSH_KEY_B64`) используется для двух SSH-подключений бэкенда:
- **Роутер** (OpenWrt, `192.168.2.1`) — для WAN IP, аптайма, DHCP, скорости
- **Медиа-сервер** (southnet, `192.168.2.169`) — для информации о дисках через `df`

Бэкенд (Docker-контейнер на Pi) подключается к роутеру по SSH для получения WAN IP, аптайма, DHCP-клиентов и скорости WAN.

**1. Сгенерировать ключ:**
```bash
ssh-keygen -t ed25519 -f /tmp/pi_dashboard_key -C "pi-dashboard@backend" -N ""
```

**2. Добавить публичный ключ на роутер:**

> ⚠️ На **OpenWrt** dropbear читает `/etc/dropbear/authorized_keys`, а **не** `/root/.ssh/authorized_keys`.

```bash
cat /tmp/pi_dashboard_key.pub | ssh root@192.168.2.1 \
  "cat >> /etc/dropbear/authorized_keys"
```

**3. Закодировать приватный ключ в base64 и добавить в `.env`:**
```bash
# macOS
base64 -i /tmp/pi_dashboard_key | tr -d '\n'
# Linux
base64 -w 0 /tmp/pi_dashboard_key
```
Результат вставить в `ROUTER_SSH_KEY_B64=...` в `.env`.

**4. Добавить тот же публичный ключ на медиа-сервер:**
```bash
cat /tmp/pi_dashboard_key.pub | ssh southnet-mac-server@192.168.2.169 \
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

> Ключ хранится в `.env` (gitignored) и читается бэкендом из переменной окружения контейнера. В памяти декодируется через `base64.b64decode()` — файл на диск не пишется.

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
>
> `.env` загружается через `source` (не `xargs`), поэтому значения с пробелами и спецсимволами корректно обрабатываются при наличии кавычек.

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

### OpenWrt: authorized_keys в /etc/dropbear/, не в /root/.ssh/

На OpenWrt dropbear по умолчанию читает ключи из `/etc/dropbear/authorized_keys`.
Стандартный путь `/root/.ssh/authorized_keys` игнорируется.

### DBUS_SESSION_BUS_ADDRESS при запуске из SSH

Без этой переменной labwc не активирует окно Chromium через xdg-activation — процесс запускается, но окно остаётся невидимым. `manage.sh kiosk` и `deploy` передают полное окружение через `KIOSK_ENV`.

### EDID ошибка в логах labwc

```
[ERROR] Failed to parse EDID
```

Нормально для DSI-дисплея — у него нет стандартного EDID. Игнорировать.

### mDNS (`.local`) не работает внутри Docker

Имена вида `southnet.local` не резолвятся внутри контейнеров — mDNS (Bonjour/Avahi) там недоступен. Для всех SSH и TCP подключений к локальным хостам **всегда указывать IP-адрес** в `.env` вместо `.local` hostname.

### Порядок запуска

`dadjet_co2` стек должен быть запущен до нашего backend — иначе сеть `dadjet_co2_co2net` не существует. На практике не проблема: оба стека имеют `restart: unless-stopped`.

### Выйти из kiosk вручную

```bash
./manage.sh kiosk-stop
# или напрямую:
ssh artfaal@192.168.2.215 "pkill -x chromium"
```
