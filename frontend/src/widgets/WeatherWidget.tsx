import { useRef } from 'react'
import type { WeatherData, WidgetProps } from '../types'

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
      {children}
    </div>
  )
}

function fmtTemp(t: number): string {
  return t > 0 ? `+${t}` : String(t)
}

const CONDITION_ICONS: Record<string, { day: string; night: string }> = {
  clear:  { day: '☀',  night: '☽' },
  cloudy: { day: '☁',  night: '☁' },
  rain:   { day: '🌧', night: '🌧' },
  snow:   { day: '❄',  night: '❄' },
  storm:  { day: '⛈', night: '⛈' },
  fog:    { day: '≋',  night: '≋' },
}

export function WeatherWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<WeatherData | null>(null)
  const wd = data as WeatherData | null
  if (wd) prevRef.current = wd
  const displayed = wd ?? prevRef.current

  if (!displayed) {
    return (
      <div className="flex flex-col h-full">
        <WidgetLabel>Погода</WidgetLabel>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const icons = CONDITION_ICONS[displayed.condition] ?? { day: '◌', night: '◌' }
  const icon  = displayed.is_day ? icons.day : icons.night

  return (
    <div className="flex flex-col h-full gap-2 animate-fadeIn">

      {/* Header: label + location + icon */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <WidgetLabel>Погода</WidgetLabel>
          <div className="text-slate-400 text-xs truncate">{displayed.location}</div>
          <div className="text-slate-500 text-[11px] truncate leading-tight">{displayed.description}</div>
        </div>
        <span className="text-slate-300 shrink-0 leading-none" style={{ fontSize: 30 }} aria-hidden>
          {icon}
        </span>
      </div>

      {/* Big temp + feels like on same line */}
      <div className="flex items-baseline gap-2">
        <span
          className="font-mono font-bold text-slate-100 leading-none"
          style={{ fontSize: 50 }}
        >
          {fmtTemp(displayed.temp)}°
        </span>
        <span className="text-slate-500 text-xs whitespace-nowrap">
          ощущ. {fmtTemp(displayed.feels_like)}°
        </span>
      </div>

      {/* Stats: 2×2 grid */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 content-start">
        <StatCell label="Влажность" value={`${displayed.humidity}%`} />
        <StatCell label="Ветер" value={`${displayed.wind_speed} ${displayed.wind_dir}`} />
        {displayed.precipitation > 0 && (
          <StatCell label="Осадки" value={`${displayed.precipitation} мм`} />
        )}
      </div>

      {/* Day range */}
      <div className="flex items-center gap-1.5 border-t border-white/[0.05] pt-1.5">
        <span className="text-blue-400 font-mono text-sm">{fmtTemp(displayed.temp_min)}°</span>
        <span className="text-slate-600 text-xs">·</span>
        <span className="text-orange-400 font-mono text-sm">{fmtTemp(displayed.temp_max)}°</span>
        <span className="text-slate-600 text-[10px] ml-1">диапазон дня</span>
      </div>

    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</span>
      <span className="text-xs text-slate-300 font-mono leading-tight">{value}</span>
    </div>
  )
}
