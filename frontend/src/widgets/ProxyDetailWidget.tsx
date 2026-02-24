import { useRef } from 'react'
import type { ProxyData, ProxyEntry, WidgetProps } from '../types'

const TYPE_LABELS: Record<string, string> = {
  socks5: 'SOCKS5',
  http:   'HTTP CONNECT',
  https:  'HTTPS CONNECT',
  ss:     'Shadowsocks',
  trojan: 'Trojan TLS',
}

const TYPE_NOTE: Record<string, string> = {
  ss:     'TCP-доступность',
  trojan: 'TLS-рукопожатие',
}

function msColor(ms: number): string {
  if (ms < 200)  return '#22c55e'
  if (ms < 600)  return '#eab308'
  if (ms < 1200) return '#f97316'
  return '#ef4444'
}

function proxyColor(entry: ProxyEntry): string {
  if (!entry.ok) return '#ef4444'
  return entry.ms != null ? msColor(entry.ms) : '#22c55e'
}

function ProxyCard({ entry }: { entry: ProxyEntry }) {
  const color   = proxyColor(entry)
  const label   = TYPE_LABELS[entry.type] ?? entry.type
  const note    = TYPE_NOTE[entry.type]
  const isFull  = !note  // full proxy test (not just TCP/TLS)

  return (
    <div
      className="flex flex-col gap-1 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]"
    >
      {/* Top row: name + status dot + latency */}
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
        <span className="text-slate-200 text-sm font-medium flex-1 truncate">{entry.name}</span>
        <span className="font-mono text-xs tabular-nums" style={{ color }}>
          {entry.ok
            ? (entry.ms != null ? `${entry.ms}ms` : '—')
            : 'FAIL'}
        </span>
      </div>

      {/* Protocol badge + exit IP */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-slate-600 px-1.5 py-0.5 bg-white/[0.05] rounded font-mono">
          {label}
        </span>
        {note && (
          <span className="text-[9px] text-slate-600 italic">{note}</span>
        )}
        {isFull && entry.ok && entry.exit_ip && (
          <span className="text-[10px] font-mono text-slate-400 ml-auto truncate">
            {entry.exit_ip}
          </span>
        )}
        {isFull && entry.ok && entry.exit_isp && (
          <span className="text-[9px] text-slate-600 truncate max-w-[100px]" title={entry.exit_isp}>
            {entry.exit_isp.length > 18 ? entry.exit_isp.slice(0, 18) + '…' : entry.exit_isp}
          </span>
        )}
        {!entry.ok && entry.error && (
          <span className="text-[9px] text-red-500/70 truncate ml-auto max-w-[160px]" title={entry.error}>
            {entry.error.length > 30 ? entry.error.slice(0, 30) + '…' : entry.error}
          </span>
        )}
      </div>
    </div>
  )
}

export function ProxyDetailWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<ProxyData | null>(null)
  const d = data as ProxyData | null
  if (d) prevRef.current = d
  const pd = d ?? prevRef.current

  if (!pd) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-600 text-sm">
        {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
      </div>
    )
  }

  const okCount    = pd.proxies.filter((p) => p.ok).length
  const fullOk     = pd.proxies.filter((p) => p.ok && !TYPE_NOTE[p.type])
  const avgMs      = fullOk.length > 0
    ? Math.round(fullOk.reduce((s, p) => s + (p.ms ?? 0), 0) / fullOk.length)
    : null

  return (
    <div className="flex flex-col h-full gap-3 animate-fadeIn">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
            Proxy / VPN · подробно
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {okCount}/{pd.proxies.length} активны
            {avgMs != null && (
              <span className="text-slate-600 ml-2">avg {avgMs}ms</span>
            )}
          </div>
        </div>
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: pd.ok ? '#22c55e' : '#ef4444',
            boxShadow: `0 0 8px ${pd.ok ? '#22c55e' : '#ef4444'}`,
          }}
        />
      </div>

      {/* Proxy cards */}
      <div className="flex flex-col gap-2 flex-1 overflow-hidden">
        {pd.proxies.map((p) => <ProxyCard key={p.name} entry={p} />)}
      </div>

      {/* Legend */}
      <div className="border-t border-white/[0.05] pt-1.5 flex gap-3 text-[9px] text-slate-600">
        <span>Xray → через роутер (VLESS/Trojan/SS)</span>
        <span className="ml-auto">SS/Trojan = порт/TLS</span>
      </div>

    </div>
  )
}
