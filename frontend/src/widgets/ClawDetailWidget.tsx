import { useRef, useState } from 'react'
import type { OpenclawData, WidgetProps } from '../types'

function fmtUptime(secs: number): string {
  if (secs < 60)   return `${secs} сек`
  if (secs < 3600) return `${Math.floor(secs / 60)} мин`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h < 24) return `${h} ч ${m} мин`
  const d = Math.floor(h / 24)
  return `${d} д ${h % 24} ч`
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

type ActionState = 'idle' | 'pending' | 'ok' | 'err'

function ActionButton({
  label,
  icon,
  color,
  hoverColor,
  glowColor,
  onAction,
  disabled,
}: {
  label:       string
  icon:        string
  color:       string
  hoverColor:  string
  glowColor:   string
  onAction:    () => Promise<void>
  disabled:    boolean
}) {
  const [state, setState] = useState<ActionState>('idle')

  const handle = async () => {
    if (disabled || state === 'pending') return
    setState('pending')
    try {
      await onAction()
      setState('ok')
    } catch {
      setState('err')
    }
    setTimeout(() => setState('idle'), 1500)
  }

  const isPending = state === 'pending'
  const isOk      = state === 'ok'
  const isErr     = state === 'err'

  return (
    <button
      onClick={handle}
      disabled={disabled || isPending}
      className="flex-1 flex flex-col items-center justify-center gap-2 py-5 rounded-2xl
                 border transition-all duration-200 select-none active:scale-95
                 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        backgroundColor: isOk  ? `${glowColor}20`
                        : isErr ? '#ef444420'
                        : `${color}12`,
        borderColor:     isOk  ? glowColor
                        : isErr ? '#ef4444'
                        : `${color}40`,
        boxShadow:       isPending ? `0 0 20px 2px ${glowColor}50`
                        : isOk    ? `0 0 16px 2px ${glowColor}60`
                        : isErr   ? '0 0 16px 2px #ef444460'
                        : 'none',
      }}
    >
      <span className="text-2xl">
        {isPending ? '⟳' : isOk ? '✓' : isErr ? '✕' : icon}
      </span>
      <span
        className="text-xs font-semibold tracking-wide uppercase"
        style={{ color: isErr ? '#ef4444' : color }}
      >
        {isPending ? '…' : isOk ? 'Готово' : isErr ? 'Ошибка' : label}
      </span>
    </button>
  )
}

async function callAction(action: 'start' | 'stop' | 'restart') {
  const r = await fetch(`/api/openclaw/${action}`, { method: 'POST' })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail ?? r.statusText)
  }
}

export function ClawDetailWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<OpenclawData | null>(null)
  const od = data as OpenclawData | null
  if (od) prevRef.current = od
  const d = od ?? prevRef.current

  if (!d) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-600">
        {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
      </div>
    )
  }

  const color = stateColor(d.state)
  const label = stateLabel(d.state, d.substate)
  const isActive = d.active

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">

      {/* ── Статус ────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 rounded-2xl p-4"
        style={{ backgroundColor: `${color}0d`, borderColor: `${color}25`, border: '1px solid' }}
      >
        {/* большой индикатор */}
        <div
          className="w-16 h-16 rounded-full shrink-0 flex items-center justify-center"
          style={{ backgroundColor: `${color}18` }}
        >
          <div
            className="w-10 h-10 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: isActive ? `0 0 16px 4px ${color}80` : 'none',
            }}
          />
        </div>

        {/* текст */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="text-base font-bold" style={{ color }}>{label}</div>
          {d.version && (
            <div className="text-[11px] text-slate-400 font-mono">openclaw-gateway v{d.version}</div>
          )}
          {isActive && d.uptime_secs != null && (
            <div className="text-[11px] text-slate-400">
              Аптайм: <span className="text-slate-300 font-medium">{fmtUptime(d.uptime_secs)}</span>
            </div>
          )}
          {isActive && (
            <div className="flex gap-4 text-[10px] text-slate-500 mt-0.5">
              {d.pid && <span>PID <span className="text-slate-400 font-mono">{d.pid}</span></span>}
              {d.cpu_mins > 0 && <span>CPU <span className="text-slate-400 font-mono">{d.cpu_mins}м</span></span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Кнопки управления ─────────────────────────────────────────── */}
      <div>
        <div className="text-[9px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-3">
          Управление сервисом
        </div>
        <div className="flex gap-3">
          <ActionButton
            label="Start"
            icon="▶"
            color="#22c55e"
            hoverColor="#4ade80"
            glowColor="#22c55e"
            disabled={isActive}
            onAction={() => callAction('start')}
          />
          <ActionButton
            label="Restart"
            icon="↺"
            color="#f59e0b"
            hoverColor="#fbbf24"
            glowColor="#f59e0b"
            disabled={false}
            onAction={() => callAction('restart')}
          />
          <ActionButton
            label="Stop"
            icon="■"
            color="#ef4444"
            hoverColor="#f87171"
            glowColor="#ef4444"
            disabled={!isActive}
            onAction={() => callAction('stop')}
          />
        </div>
      </div>

    </div>
  )
}
