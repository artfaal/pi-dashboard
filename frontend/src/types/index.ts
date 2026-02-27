export interface ModulePayload {
  module: string
  ok: boolean
  data: unknown
  error?: string
}

export interface CO2Data {
  ppm: number
  temp: number
}

export interface InternetTarget {
  name: string
  ok: boolean
  ms: number | null
}

export interface WeatherData {
  location: string
  temp: number
  feels_like: number
  humidity: number
  wind_speed: number
  wind_dir: string
  wind_gusts?: number
  pressure?: number
  precipitation: number
  uv_index?: number
  precip_today?: number
  sunrise?: string
  sunset?: string
  condition: string
  description: string
  is_day: boolean
  temp_max: number
  temp_min: number
}

export interface PlantData {
  name: string
  group: string
  image_url: string
  humidity: number
  humidity_min: number
  humidity_max: number
  temp: number
  battery?: number
}

export interface PlantsData {
  plants: PlantData[]
  count: number
}

export interface RouterData {
  wan_ip:       string
  uptime_secs:  number
  dhcp_clients: number
  wan_rx_bps:   number
  wan_tx_bps:   number
}

export interface ProxyEntry {
  name:      string
  type:      string   // 'socks5' | 'http' | 'https' | 'ss' | 'trojan'
  ok:        boolean
  ms:        number | null
  exit_ip?:  string
  exit_isp?: string
  error?:    string
}

export interface ProxyData {
  ok:      boolean
  proxies: ProxyEntry[]
}

export interface InternetData {
  online:   boolean
  targets:  InternetTarget[]
  dns_ok:   boolean
  dns_ms:   number | null
}

export interface TorrentItem {
  id:                 number
  name:               string
  status:             'downloading' | 'seeding' | 'paused' | 'checking' | 'error' | 'unknown'
  progress:           number        // 0–100
  size_bytes:         number
  download_speed_bps: number
  upload_speed_bps:   number
  eta_secs:           number | null
  added_date:         string | null // ISO
  peers:              number
}

export interface DiskInfo {
  name:     string   // "Main" | "NVME" | "HDD"
  mount:    string
  total_gb: number
  free_gb:  number
  used_pct: number
}

export interface TorrentData {
  downloading: TorrentItem | null
  recent:      TorrentItem[]
  speed: {
    download_bps: number
    upload_bps:   number
  }
  disks: DiskInfo[]
}

export interface OpenclawData {
  active:       boolean
  state:        'active' | 'inactive' | 'failed' | 'activating' | string
  substate:     string
  uptime_secs:  number | null
  pid:          number | null
  cpu_mins:     number
  version:      string | null
}

export interface PlexSession {
  title: string
  type: 'movie' | 'episode'
  show?: string
  season?: number
  episode?: number
  progress_pct: number
  thumb: string | null
  player: string
  duration_ms: number
  view_offset_ms: number
}

export interface PlexMediaItem {
  title: string
  year?: number | null
  rating?: number | null
  genres?: string[]
  thumb: string | null
  added_at: number
  season?: number | null
}

export interface PlexData {
  now_playing: PlexSession[]
  recent_movies: PlexMediaItem[]
  recent_shows: PlexMediaItem[]
}

// Standard props interface for all widgets
export interface WidgetProps {
  data: unknown
  error?: string
  // Optional: expanded widget can register a key handler.
  // Called by App with 'KeyA'|'KeyC'|'KeyD' when widget is expanded.
  // Return true = key consumed (don't run App default); false = fall through.
  keyActionRef?: { current: ((code: string) => boolean) | null }
}
