import { useRef } from 'react'
import type { WeatherData, WidgetProps } from '../types'

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

function uvLabel(uv: number): string {
  if (uv < 3)  return 'Низкий'
  if (uv < 6)  return 'Умеренный'
  if (uv < 8)  return 'Высокий'
  if (uv < 11) return 'Очень высокий'
  return 'Экстремальный'
}

function uvColor(uv: number): string {
  if (uv < 3)  return '#22c55e'
  if (uv < 6)  return '#eab308'
  if (uv < 8)  return '#f97316'
  if (uv < 11) return '#ef4444'
  return '#a855f7'
}

function DetailRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[9px] text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-sm text-slate-200 font-mono leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-slate-500 leading-tight">{sub}</span>}
    </div>
  )
}

export function WeatherDetailWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<WeatherData | null>(null)
  const wd = data as WeatherData | null
  if (wd) prevRef.current = wd
  const d = wd ?? prevRef.current

  if (!d) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-600 text-sm">
        {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
      </div>
    )
  }

  const icons = CONDITION_ICONS[d.condition] ?? { day: '◌', night: '◌' }
  const icon  = d.is_day ? icons.day : icons.night
  const uv    = d.uv_index ?? 0

  // Day temp range bar
  const rangeLo = -20
  const rangeHi = 45
  const minPct = Math.round(((d.temp_min - rangeLo) / (rangeHi - rangeLo)) * 100)
  const maxPct = Math.round(((d.temp_max - rangeLo) / (rangeHi - rangeLo)) * 100)
  const curPct = Math.round(((d.temp     - rangeLo) / (rangeHi - rangeLo)) * 100)
  const barLeft  = Math.max(0, Math.min(minPct, 100))
  const barWidth = Math.max(0, Math.min(maxPct, 100)) - barLeft

  return (
    <div className="flex flex-col h-full gap-3 animate-fadeIn">

      {/* ── Top: icon + location + description ──────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
            Погода · подробно
          </div>
          <div className="text-slate-300 text-sm font-medium truncate">{d.location}</div>
          <div className="text-slate-400 text-xs truncate">{d.description}</div>
        </div>
        <span className="text-slate-300 shrink-0 leading-none" style={{ fontSize: 38 }} aria-hidden>
          {icon}
        </span>
      </div>

      {/* ── Temperature block ────────────────────────────────────────────── */}
      <div className="flex items-baseline gap-3">
        <span
          className="font-mono font-bold text-slate-100 leading-none"
          style={{ fontSize: 56 }}
        >
          {fmtTemp(d.temp)}°
        </span>
        <div className="flex flex-col">
          <span className="text-slate-400 text-sm">ощущается {fmtTemp(d.feels_like)}°</span>
          <span className="text-slate-500 text-xs">влажность {d.humidity}%</span>
        </div>
      </div>

      {/* ── Stats grid 3×2 ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-white/[0.05] pt-3">
        <DetailRow
          label="Ветер"
          value={`${d.wind_speed} м/с ${d.wind_dir}`}
          sub={d.wind_gusts ? `порывы до ${d.wind_gusts} м/с` : undefined}
        />
        <DetailRow
          label="Давление"
          value={d.pressure ? `${Math.round(d.pressure * 0.750064)} мм` : '—'}
          sub={d.pressure ? `${d.pressure} гПа` : undefined}
        />
        <DetailRow
          label="УФ-индекс"
          value={`${uv} · ${uvLabel(uv)}`}
        />
        <DetailRow
          label="Осадки сейчас"
          value={`${d.precipitation} мм`}
        />
        {d.precip_today !== undefined && (
          <DetailRow
            label="Осадки за день"
            value={`${d.precip_today} мм`}
          />
        )}
        {d.sunrise && d.sunset && (
          <DetailRow
            label="Восход / Закат"
            value={`${d.sunrise} / ${d.sunset}`}
          />
        )}
      </div>

      {/* ── Day temperature range bar ────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 border-t border-white/[0.05] pt-2 mt-auto">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Диапазон дня</span>
          <span className="font-mono">
            <span className="text-blue-400">{fmtTemp(d.temp_min)}°</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-orange-400">{fmtTemp(d.temp_max)}°</span>
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
          {/* range band */}
          <div
            className="absolute h-full rounded-full"
            style={{
              left:  `${barLeft}%`,
              width: `${barWidth}%`,
              background: 'linear-gradient(to right, #60a5fa, #f97316)',
            }}
          />
          {/* current temp marker */}
          <div
            className="absolute top-0 w-0.5 h-full bg-white/80 rounded-full"
            style={{ left: `${curPct}%`, transform: 'translateX(-50%)' }}
          />
        </div>
        {/* UV bar */}
        <div className="relative h-1 rounded-full bg-slate-800 overflow-hidden mt-0.5">
          <div
            className="absolute h-full rounded-full transition-all"
            style={{
              width: `${Math.min(uv / 12, 1) * 100}%`,
              backgroundColor: uvColor(uv),
            }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>УФ: {uv}</span>
          <span style={{ color: uvColor(uv) }}>{uvLabel(uv)}</span>
        </div>
      </div>

    </div>
  )
}
