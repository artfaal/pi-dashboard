import { useRef } from 'react'
import type { WeatherData, WidgetProps } from '../types'

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
      {children}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] text-slate-600">{label}</span>
      <span className="text-xs text-slate-300 font-mono tabular-nums">{value}</span>
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

      {/* Row 1: label + location / description + icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <WidgetLabel>Погода</WidgetLabel>
          <span className="text-slate-400 text-xs">{displayed.location}</span>
          <span className="text-[11px] text-slate-500 leading-tight">{displayed.description}</span>
        </div>
        <span
          className="text-slate-300 shrink-0"
          style={{ fontSize: 36, lineHeight: 1 }}
          aria-hidden
        >
          {icon}
        </span>
      </div>

      {/* Row 2: big temp + stats */}
      <div className="flex items-center gap-3 flex-1">
        {/* Big temperature */}
        <div className="flex items-start leading-none shrink-0">
          <span
            className="font-mono font-bold text-slate-100"
            style={{ fontSize: 54, lineHeight: 1 }}
          >
            {fmtTemp(displayed.temp)}
          </span>
          <span className="text-slate-500 text-xl mt-1.5 ml-0.5">°</span>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <StatRow label="Ощущается" value={`${fmtTemp(displayed.feels_like)}°`} />
          <StatRow label="Влажность"  value={`${displayed.humidity}%`} />
          <StatRow label="Ветер"      value={`${displayed.wind_speed} км/ч ${displayed.wind_dir}`} />
          {displayed.precipitation > 0 && (
            <StatRow label="Осадки" value={`${displayed.precipitation} мм`} />
          )}
        </div>
      </div>

      {/* Row 3: day range */}
      <div className="flex items-center justify-center gap-2 text-sm border-t border-white/[0.05] pt-2">
        <span className="text-blue-400 font-mono text-sm">{fmtTemp(displayed.temp_min)}°</span>
        <span className="text-slate-600">·</span>
        <span className="text-orange-400 font-mono text-sm">{fmtTemp(displayed.temp_max)}°</span>
        <span className="text-slate-600 text-[10px]">диапазон дня</span>
      </div>

    </div>
  )
}
