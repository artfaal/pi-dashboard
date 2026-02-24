import { useRef } from 'react'
import type { RouterData, WidgetProps } from '../types'

function fmtUptime(secs: number): string {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

function fmtSpeed(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`
  if (bps >= 1_000)     return `${(bps / 1_000).toFixed(0)} KB/s`
  return `${bps} B/s`
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
      <span className={`text-xs text-slate-200 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

export function RouterWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<RouterData | null>(null)
  const d = data as RouterData | null
  if (d) prevRef.current = d
  const rd = d ?? prevRef.current

  if (!rd) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Роутер</div>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание…'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-2 animate-fadeIn">

      <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
        Роутер
      </div>

      {/* WAN IP — big */}
      <div className="flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e' }}
        />
        <span className="font-mono text-slate-100 text-sm font-semibold truncate">{rd.wan_ip}</span>
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1.5 flex-1 justify-center border-t border-white/[0.05] pt-2">
        <Row label="Аптайм"   value={fmtUptime(rd.uptime_secs)} />
        <Row label="Клиенты"  value={String(rd.dhcp_clients)} />
        <Row
          label="WAN ↓"
          value={fmtSpeed(rd.wan_rx_bps)}
        />
        <Row
          label="WAN ↑"
          value={fmtSpeed(rd.wan_tx_bps)}
        />
      </div>

    </div>
  )
}
