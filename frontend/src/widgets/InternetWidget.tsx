import { useRef } from 'react'
import type { InternetData, InternetTarget, WidgetProps } from '../types'

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
      {children}
    </div>
  )
}

function LatencyBar({ ms, maxMs = 300 }: { ms: number; maxMs?: number }) {
  const pct   = Math.min(ms / maxMs, 1) * 100
  const color = ms < 50 ? '#22c55e' : ms < 150 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums" style={{ color, minWidth: '3rem', textAlign: 'right' }}>
        {ms}ms
      </span>
    </div>
  )
}

function TargetRow({ target }: { target: InternetTarget }) {
  const dotColor = target.ok ? '#22c55e' : '#ef4444'
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
      />
      <span className="text-sm text-slate-300 w-20 truncate">{target.name}</span>
      {target.ok && target.ms !== null
        ? <LatencyBar ms={target.ms} />
        : <span className="text-xs text-red-500 ml-auto">недоступен</span>
      }
    </div>
  )
}

export function InternetWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<InternetData | null>(null)
  const d = data as InternetData | null
  if (d) prevRef.current = d
  const displayed = d ?? prevRef.current

  if (!displayed) {
    return (
      <div className="flex flex-col h-full">
        <WidgetLabel>Интернет</WidgetLabel>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const statusColor = displayed.online ? '#22c55e' : '#ef4444'

  return (
    <div className="flex flex-col h-full gap-2 animate-fadeIn">
      <WidgetLabel>Интернет</WidgetLabel>

      {/* Status */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: statusColor, boxShadow: `0 0 10px ${statusColor}` }}
        />
        <span className="text-xl font-bold tracking-tight" style={{ color: statusColor }}>
          {displayed.online ? 'Online' : 'Offline'}
        </span>
        {/* DNS inline */}
        <span className="ml-auto text-[10px] font-mono" style={{ color: displayed.dns_ok ? '#22c55e' : '#ef4444' }}>
          DNS {displayed.dns_ok ? (displayed.dns_ms ? `${displayed.dns_ms}ms` : 'ok') : 'fail'}
        </span>
      </div>

      <div className="border-t border-white/[0.05]" />

      <div className="flex flex-col divide-y divide-white/[0.04] flex-1">
        {displayed.targets.map((t) => <TargetRow key={t.name} target={t} />)}
      </div>
    </div>
  )
}
