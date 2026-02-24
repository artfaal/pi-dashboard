import { useRef } from 'react'
import type { InternetData, InternetTarget, WidgetProps } from '../types'

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return `${ms}ms`
}

function msColor(ms: number): string {
  return ms < 50 ? '#22c55e' : ms < 150 ? '#eab308' : '#ef4444'
}

function TargetRow({ target }: { target: InternetTarget }) {
  const ok    = target.ok
  const color = ok ? (target.ms != null ? msColor(target.ms) : '#22c55e') : '#ef4444'
  const bar   = ok && target.ms != null
    ? Math.min(target.ms / 400, 1) * 100
    : 0

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="text-sm text-slate-300 w-24 shrink-0 truncate">{target.name}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${bar}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums w-14 text-right" style={{ color }}>
        {ok && target.ms != null ? `${target.ms}ms` : 'fail'}
      </span>
    </div>
  )
}

export function InternetDetailWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<InternetData | null>(null)
  const d = data as InternetData | null
  if (d) prevRef.current = d
  const id = d ?? prevRef.current

  if (!id) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-600 text-sm">
        {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
      </div>
    )
  }

  const statusColor = id.online ? '#22c55e' : '#ef4444'
  const dnsColor    = id.dns_ok  ? '#22c55e' : '#ef4444'

  return (
    <div className="flex flex-col h-full gap-3 animate-fadeIn">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
            Интернет · подробно
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            />
            <span className="text-lg font-bold" style={{ color: statusColor }}>
              {id.online ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* DNS block */}
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[9px] text-slate-500 uppercase tracking-widest">DNS resolve</span>
          <span className="font-mono text-sm font-bold" style={{ color: dnsColor }}>
            {id.dns_ok ? fmtMs(id.dns_ms) : 'FAIL'}
          </span>
          <span className="text-[9px] text-slate-600">google.com</span>
        </div>
      </div>

      <div className="border-t border-white/[0.05]" />

      {/* Targets */}
      <div className="flex flex-col gap-3 flex-1">
        {id.targets.map((t) => <TargetRow key={t.name} target={t} />)}
      </div>

      {/* Summary footer */}
      <div className="border-t border-white/[0.05] pt-2 flex items-center gap-3 text-[10px] text-slate-500">
        <span>
          Доступно:{' '}
          <span className="text-slate-300 font-mono">
            {id.targets.filter((t) => t.ok).length}/{id.targets.length}
          </span>
        </span>
        {id.dns_ok && id.dns_ms != null && (
          <span>
            Среднее:{' '}
            <span className="text-slate-300 font-mono">
              {Math.round(
                id.targets.filter((t) => t.ok && t.ms != null)
                  .reduce((s, t) => s + t.ms!, 0) /
                Math.max(1, id.targets.filter((t) => t.ok && t.ms != null).length)
              )}ms
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
