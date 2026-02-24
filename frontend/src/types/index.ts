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

export interface InternetData {
  online: boolean
  targets: InternetTarget[]
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

// Standard props interface for all widgets
export interface WidgetProps {
  data: unknown
  error?: string
}
