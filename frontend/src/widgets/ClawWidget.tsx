import { useRef } from 'react'
import type { OpenclawData, WidgetProps } from '../types'

function fmtUptime(secs: number): string {
  if (secs < 60)   return `${secs}с`
  if (secs < 3600) return `${Math.floor(secs / 60)}м`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h < 24) return `${h}ч ${m}м`
  const d = Math.floor(h / 24)
  return `${d}д ${h % 24}ч`
}

function stateColor(state: string): string {
  switch (state) {
    case 'active':      return '#22c55e'
    case 'activating':  return '#f59e0b'
    case 'failed':      return '#ef4444'
    default:            return '#475569'
  }
}

function stateLabel(state: string, substate: string): string {
  if (state === 'active' && substate === 'running') return 'Работает'
  if (state === 'activating') return 'Запускается…'
  if (state === 'failed')     return 'Ошибка'
  if (state === 'inactive')   return 'Остановлен'
  return state
}

export function ClawWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<OpenclawData | null>(null)
  const od = data as OpenclawData | null
  if (od) prevRef.current = od
  const d = od ?? prevRef.current

  if (!d) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Клоя</div>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание…'}
        </div>
      </div>
    )
  }

  const color = stateColor(d.state)
  const label = stateLabel(d.state, d.substate)

  return (
    <div className="flex flex-col h-full gap-3 animate-fadeIn">

      {/* header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Клоя</span>
        {d.version && (
          <span className="text-[9px] text-slate-600 font-mono">v{d.version}</span>
        )}
      </div>

      {/* статус — центральный блок */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        {/* индикатор */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: `${color}18`,
            boxShadow: d.active ? `0 0 24px 4px ${color}40` : 'none',
          }}
        >
          <div
            className="w-8 h-8 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: d.active ? `0 0 12px 2px ${color}` : 'none',
            }}
          />
        </div>

        {/* текст статуса */}
        <div className="text-center">
          <div className="text-sm font-semibold" style={{ color }}>{label}</div>
          {d.active && d.uptime_secs != null && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              ↑ {fmtUptime(d.uptime_secs)}
            </div>
          )}
        </div>
      </div>

      {/* PID + CPU */}
      {d.active && (
        <div className="flex justify-between text-[9px] text-slate-600 border-t border-white/[0.05] pt-2">
          {d.pid && <span>PID {d.pid}</span>}
          {d.cpu_mins > 0 && <span>CPU {d.cpu_mins}м</span>}
        </div>
      )}

    </div>
  )
}
