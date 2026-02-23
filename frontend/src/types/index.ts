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
  precipitation: number
  condition: string
  description: string
  is_day: boolean
  temp_max: number
  temp_min: number
}

// Standard props interface for all widgets
export interface WidgetProps {
  data: unknown
  error?: string
}
