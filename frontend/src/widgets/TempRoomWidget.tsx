import { useRef } from 'react'
import type { CO2Data, WidgetProps } from '../types'

const COLD      = Number(import.meta.env.VITE_TEMP_COLD      ?? 18)
const WARM      = Number(import.meta.env.VITE_TEMP_WARM      ?? 24)
const SCALE_MIN = Number(import.meta.env.VITE_TEMP_SCALE_MIN ?? 10)
const SCALE_MAX = Number(import.meta.env.VITE_TEMP_SCALE_MAX ?? 40)

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
      {children}
    </div>
  )
}

export function TempRoomWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<CO2Data | null>(null)
  const co2Data = data as CO2Data | null
  if (co2Data) prevRef.current = co2Data
  const displayed = co2Data ?? prevRef.current

  if (!displayed) {
    return (
      <div className="flex flex-col h-full">
        <WidgetLabel>Температура</WidgetLabel>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const temp = displayed.temp
  const color =
    temp < COLD - 2 ? '#60a5fa' :
    temp > WARM + 2 ? '#f87171' :
                      '#4ade80'

  const comfort =
    temp < COLD ? 'Прохладно' :
    temp > WARM ? 'Жарковато' :
                  'Комфортно'

  const range = SCALE_MAX - SCALE_MIN
  const pct = Math.min(Math.max((temp - SCALE_MIN) / range, 0), 1) * 100

  return (
    <div className="flex flex-col h-full gap-3 animate-fadeIn">
      <WidgetLabel>Температура</WidgetLabel>

      {/* Big number */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        <div className="flex items-start leading-none">
          <span
            className="font-mono font-bold"
            style={{ fontSize: 68, color, lineHeight: 1, transition: 'color 1s' }}
          >
            {temp}
          </span>
          <span className="text-slate-500 text-2xl mt-2 ml-1">°C</span>
        </div>

        {/* Comfort badge */}
        <div
          className="mt-2 px-3 py-0.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: `${color}20`,
            color,
            border: `1px solid ${color}40`,
            transition: 'all 1s',
          }}
        >
          {comfort}
        </div>
      </div>

      {/* Range bar */}
      <div className="space-y-1.5">
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden relative">
          {/* Comfortable zone highlight */}
          <div
            className="absolute top-0 h-full rounded-full opacity-20"
            style={{
              left: `${((COLD - SCALE_MIN) / range) * 100}%`,
              width: `${((WARM - COLD) / range) * 100}%`,
              backgroundColor: '#4ade80',
            }}
          />
          {/* Temperature cursor */}
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${pct}%`,
              backgroundColor: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-600">
          <span>{SCALE_MIN}°</span>
          <span className="text-slate-700">{COLD}°–{WARM}° комфорт</span>
          <span>{SCALE_MAX}°</span>
        </div>
      </div>
    </div>
  )
}
