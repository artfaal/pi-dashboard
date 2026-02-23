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
